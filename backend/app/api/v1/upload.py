"""upload.py - Curriculum PDF ingestion and project-name detection."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.common import clean_text, http_error, read_upload_limited, safe_basename
from app.core.config import settings
from app.core.logging import logger
from app.schemas.upload import DetectProjectResponse, ResourceMetadata, UploadResponse
from app.services.ai_generator import (
    clean_chapter_title,
    detect_project_title,
    infer_curriculum_chapter_title,
)
from app.services.pdf_reader import extract_pdf_images, extract_pdf_text_with_meta

router = APIRouter()

DEFAULT_MAX_FILES = 20
DEFAULT_MAX_TOTAL_BYTES = 500 * 1024 * 1024
MAX_CATEGORY_MAP_CHARS = 64 * 1024
MAX_CATEGORY_MAP_ENTRIES = 200
MAX_CATEGORY_CHARS = 50
PREVIEW_CHARS = 200

_PDF_EXT_RE = re.compile(r"\.pdf$", re.IGNORECASE)
_PROJECT_CODE_RE = re.compile(r"\bp-\d+\b")


# =========================================================
# HELPERS
# =========================================================

def detect_file_category(filename: str, text: str = "") -> str:
    """
    Categorize curriculum documents into: topic, activity, project, resource,
    by inspecting the filename and the first 2000 characters of text.
    """
    fn = (filename or "").lower()
    t = (text[:2000] if text else "").lower()

    if "topic" in fn or "module" in fn or "lesson" in fn or "unit" in fn:
        return "topic"
    if "activit" in fn or "lab" in fn or "experiment" in fn:
        return "activity"
    if "p-" in fn or "project" in fn or "tech" in fn or "infra" in fn or "capstone" in fn:
        return "project"
    if "activity" in t or "experiment" in t:
        return "activity"
    if "project:" in t or "project -" in t:
        return "project"
    if "module " in t or "lesson " in t:
        return "topic"
    return "resource"


def _parse_category_map(raw: Optional[str]) -> Dict[str, str]:
    """Parse the optional {filename-or-key: category} JSON. Invalid input is ignored."""
    if not raw:
        return {}
    if len(raw) > MAX_CATEGORY_MAP_CHARS:
        raise HTTPException(status_code=400, detail="category_map is too large.")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Ignoring malformed category_map (invalid JSON).")
        return {}
    if not isinstance(parsed, dict):
        logger.warning("Ignoring category_map (expected a JSON object).")
        return {}

    result: Dict[str, str] = {}
    for k, v in list(parsed.items())[:MAX_CATEGORY_MAP_ENTRIES]:
        if isinstance(k, str) and isinstance(v, str):
            key, value = clean_text(k, 255), clean_text(v, MAX_CATEGORY_CHARS)
            if key and value:
                result[key] = value
    return result


def _unique_key(base: str, taken: Dict[str, str]) -> str:
    key, idx = base, 2
    while key in taken:
        key = f"{base}_{idx}"
        idx += 1
    return key


# =========================================================
# ENDPOINTS
# =========================================================

@router.post("/upload-pdfs", response_model=UploadResponse)
async def upload_pdfs(
    files: List[UploadFile] = File(...),
    category_map: Optional[str] = Form(None),
):
    """
    Ingest multiple curriculum PDFs (Topics, Activities, Projects, Chapter Quiz, Extra Resources).
    Extracts text per document and returns categorized metadata.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    max_files = int(getattr(settings, "MAX_UPLOAD_FILES", DEFAULT_MAX_FILES))
    if len(files) > max_files:
        raise HTTPException(status_code=400, detail=f"Too many files (limit is {max_files}).")

    per_file_limit = settings.MAX_UPLOAD_SIZE_BYTES
    total_limit = int(getattr(settings, "MAX_TOTAL_UPLOAD_BYTES", DEFAULT_MAX_TOTAL_BYTES))
    custom_categories = _parse_category_map(category_map)

    extracted_resources: Dict[str, str] = {}
    metadata_map: Dict[str, ResourceMetadata] = {}
    all_extracted_images: List[Dict[str, Any]] = []
    consumed = 0

    for file in files:
        filename = safe_basename(file.filename) or "Unnamed.pdf"
        try:
            content = await read_upload_limited(file, per_file_limit, name=filename)
            consumed += len(content)
            if consumed > total_limit:
                raise HTTPException(
                    status_code=413,
                    detail=f"Total upload size exceeds {total_limit // (1024 * 1024)}MB.",
                )

            text, page_count = await run_in_threadpool(extract_pdf_text_with_meta, content)
            del content                                   # release the raw bytes early
            file_images = []                              # Do not extract decorative clip-art from PDFs; sensor images come strictly from assets/sensors/grade_{grade}/

            key = _unique_key(_PDF_EXT_RE.sub("", filename).strip() or "document", extracted_resources)
            for img in file_images:
                img["source_doc"] = key
                all_extracted_images.append(img)

            category = (
                custom_categories.get(filename)
                or custom_categories.get(key)
                or detect_file_category(filename, text)
            )

            extracted_resources[key] = text
            metadata_map[key] = ResourceMetadata(
                name=filename,
                page_count=page_count,
                char_count=len(text),
                preview=text[:PREVIEW_CHARS].replace("\n", " ").strip() + "...",
                category=category,
                image_count=len(file_images),
            )
        except Exception as exc:
            raise http_error(
                exc, f"Reading uploaded PDF {type(exc).__name__}", f"Failed to parse {filename}",
                value_error_status=422, value_error_prefix=f"Failed to parse {filename}: ",
            ) from exc
        finally:
            await file.close()

    suggested_title = infer_curriculum_chapter_title(
        extracted_resources,
        filenames=[safe_basename(f.filename) for f in files if f.filename],
    )

    return UploadResponse(
        success=True,
        message=f"Successfully extracted {len(extracted_resources)} curriculum documents.",
        count=len(extracted_resources),
        resources=extracted_resources,
        metadata=metadata_map,
        suggested_chapter_title=suggested_title,
        extracted_images=all_extracted_images,
    )


@router.post("/detect-project-name", response_model=DetectProjectResponse)
async def detect_project_name(file: UploadFile = File(...)):
    """Detect the formal project or activity name from the first pages of a PDF."""
    try:
        content = await read_upload_limited(file, settings.MAX_UPLOAD_SIZE_BYTES)
    except HTTPException:
        await file.close()
        raise                                             # 413: oversized upload

    try:
        text, _ = await run_in_threadpool(extract_pdf_text_with_meta, content, max_extract_pages=2)
        raw_title = detect_project_title(text, filename=safe_basename(file.filename))
        title = clean_chapter_title(raw_title)
        return DetectProjectResponse(success=True, project_name=title)
    except Exception as exc:
        logger.error("Project detection error (%s).", type(exc).__name__)
        return DetectProjectResponse(success=False, project_name="STEM Curriculum Project")
    finally:
        await file.close()


@router.post("/curriculum/load-chapter", response_model=UploadResponse)
async def load_curriculum_chapter(
    grade: int = Query(7, ge=6, le=12),
    chapter: Optional[str] = Query(None),
):
    """
    Load curriculum materials for a verified grade and optional chapter.
    1. Searches disk for PDFs matching the grade and chapter name.
    2. If no disk PDFs match, queries the SQLite curriculum database for records in this grade/chapter
       and synthesizes structured module specifications into extracted_resources.
    """
    from app.api.v1.assessment import _find_chapter_dirs
    from app.services.curriculum_service import curriculum_service

    extracted_resources: Dict[str, str] = {}
    metadata_map: Dict[str, ResourceMetadata] = {}
    suggested_title = f"Grade {grade} Curriculum"
    if chapter:
        suggested_title = chapter

    # 1. Attempt dynamic discovery of PDFs on disk
    possible_dirs = _find_chapter_dirs(grade)
    pdf_files: List[Path] = []

    for d in possible_dirs:
        if not d.is_dir():
            continue
        # Scan folder and subdirectories for curriculum PDFs
        candidates: List[Path] = [d]
        try:
            candidates.extend([sub for sub in d.iterdir() if sub.is_dir()])
        except Exception:
            pass

        for cand in candidates:
            if chapter:
                ch_clean = chapter.lower().replace(":", " ").replace("-", " ")
                cand_clean = cand.name.lower().replace(":", " ").replace("-", " ")
                tokens = [t for t in ch_clean.split() if len(t) > 3]
                if any(t in cand_clean for t in tokens) or cand == d:
                    pdf_files.extend(sorted(list(cand.glob("*.pdf")), key=lambda p: p.name))
            else:
                pdf_files.extend(sorted(list(cand.glob("*.pdf")), key=lambda p: p.name))

    # De-duplicate PDF files
    seen_paths = set()
    unique_pdfs: List[Path] = []
    for p in pdf_files:
        real_p = str(p.resolve())
        if real_p not in seen_paths:
            seen_paths.add(real_p)
            unique_pdfs.append(p)

    if unique_pdfs:
        for pdf_path in unique_pdfs:
            filename = pdf_path.name
            try:
                content = pdf_path.read_bytes()
                text, page_count = await run_in_threadpool(extract_pdf_text_with_meta, content)
                key = _unique_key(_PDF_EXT_RE.sub("", filename).strip() or "document", extracted_resources)
                cat = detect_file_category(filename, text)

                extracted_resources[key] = text
                metadata_map[key] = ResourceMetadata(
                    name=filename,
                    page_count=page_count,
                    char_count=len(text),
                    preview=text[:PREVIEW_CHARS].replace("\n", " ").strip() + "...",
                    category=cat,
                    image_count=0,
                )
            except Exception as e:
                logger.warning(f"Failed extracting PDF {filename}: {e}")

    # 2. Check Cloudinary PDF assets stored in database
    cloudinary_assets, _ = curriculum_service.list_pdf_assets(
        grade=grade,
        chapter=chapter,
        page=1,
        page_size=100,
    )
    if cloudinary_assets:
        if not chapter:
            suggested_title = cloudinary_assets[0].chapter or f"Grade {grade} Curriculum"
        for c_asset in cloudinary_assets:
            key = _unique_key(f"{c_asset.category}-{c_asset.title}", extracted_resources)
            preview_txt = c_asset.metadata.get("extracted_text") or c_asset.metadata.get("preview_text", "")
            spec_text = (
                f"=== CLOUDINARY CURRICULUM ASSET: {c_asset.title} ===\n"
                f"Grade: Grade {c_asset.grade}\n"
                f"Chapter: {c_asset.chapter}\n"
                f"Category: {c_asset.category}\n"
                f"Cloudinary URL: {c_asset.secure_url}\n"
                f"Content Summary: {preview_txt}\n"
            )
            extracted_resources[key] = spec_text
            metadata_map[key] = ResourceMetadata(
                name=c_asset.title,
                page_count=c_asset.metadata.get("page_count", 1),
                char_count=len(spec_text),
                preview=spec_text[:PREVIEW_CHARS].replace("\n", " ").strip() + "...",
                category=c_asset.category.lower(),
                image_count=0,
            )

    # 3. If no PDFs found on disk or Cloudinary, query curriculum database module records
    if not extracted_resources:
        records, _ = curriculum_service.list_records(
            grade=grade,
            chapter=chapter,
            page=1,
            page_size=200,
        )
        if records:
            if not chapter and records:
                suggested_title = records[0].chapter or f"Grade {grade} Curriculum"

            for rec in records:
                key = f"{rec.category}-{rec.video_id}"
                spec_text = (
                    f"=== CURRICULUM MODULE: {rec.video_id} ===\n"
                    f"Grade: Grade {rec.grade}\n"
                    f"Chapter: {rec.chapter}\n"
                    f"Category: {rec.category}\n"
                    f"Module ID: {rec.video_id}\n"
                    f"Sequence Number: #{rec.count}\n"
                    f"Status: {rec.status.value}\n\n"
                    f"Educational Module Description:\n"
                    f"Official curriculum learning unit covering '{rec.chapter}', specifically focusing on "
                    f"{rec.category} module {rec.video_id}. Designed to develop student mastery in hands-on "
                    f"engineering principles, circuit design, programming fundamentals, safety protocols, "
                    f"and diagnostic troubleshooting.\n\n"
                    f"Core Competencies & Objectives:\n"
                    f"1. Conceptual Understanding: Master the scientific and computational theory of {rec.chapter}.\n"
                    f"2. Practical Application: Connect, wire, program, and operate hardware sensors and components without errors.\n"
                    f"3. Safety & Verification: Strictly follow lab safety, voltage tolerances, and prevent short circuits.\n"
                    f"4. Problem Solving & Analysis: Calculate expected sensor outputs, debug syntax and wiring anomalies.\n"
                )
                extracted_resources[key] = spec_text
                metadata_map[key] = ResourceMetadata(
                    name=f"{rec.video_id} - {rec.category}",
                    page_count=1,
                    char_count=len(spec_text),
                    preview=spec_text[:PREVIEW_CHARS].replace("\n", " ").strip() + "...",
                    category=rec.category,
                    image_count=0,
                )

    if not extracted_resources:
        ch_desc = f" ({chapter})" if chapter else ""
        raise HTTPException(
            status_code=404,
            detail=f"No curriculum materials or database records found for Grade {grade}{ch_desc}. Please upload course PDFs in Ingest or add curriculum records in Curriculum View.",
        )

    return UploadResponse(
        success=True,
        message=f"Successfully loaded {len(extracted_resources)} curriculum materials for Grade {grade}.",
        count=len(extracted_resources),
        resources=extracted_resources,
        metadata=metadata_map,
        suggested_chapter_title=suggested_title,
        extracted_images=[],
    )
