"""upload.py - Curriculum PDF ingestion and project-name detection."""

from __future__ import annotations

import json
import re
from typing import Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.common import clean_text, http_error, read_upload_limited, safe_basename
from app.core.config import settings
from app.core.logging import logger
from app.schemas.upload import DetectProjectResponse, ResourceMetadata, UploadResponse
from app.services.ai_generator import detect_project_title
from app.services.pdf_reader import extract_pdf_text_with_meta

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

    if "activit" in fn or "lab" in fn or "experiment" in fn or "activity" in t or "experiment" in t:
        return "activity"
    if "project" in fn or _PROJECT_CODE_RE.search(fn) or "capstone" in fn or "project:" in t or "project -" in t:
        return "project"
    if "topic" in fn or "module" in fn or "lesson" in fn or "unit" in fn or "module " in t or "lesson " in t:
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

            key = _unique_key(_PDF_EXT_RE.sub("", filename).strip() or "document", extracted_resources)
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
            )
        except Exception as exc:
            raise http_error(
                exc, f"Reading uploaded PDF {type(exc).__name__}", f"Failed to parse {filename}",
                value_error_status=422, value_error_prefix=f"Failed to parse {filename}: ",
            ) from exc
        finally:
            await file.close()

    return UploadResponse(
        success=True,
        message=f"Successfully extracted {len(extracted_resources)} curriculum documents.",
        count=len(extracted_resources),
        resources=extracted_resources,
        metadata=metadata_map,
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
        text, _ = await run_in_threadpool(extract_pdf_text_with_meta, content)
        title = detect_project_title(text, filename=safe_basename(file.filename))
        return DetectProjectResponse(success=True, project_name=title)
    except Exception as exc:
        logger.error("Project detection error (%s).", type(exc).__name__)
        return DetectProjectResponse(success=False, project_name="STEM Curriculum Project")
    finally:
        await file.close()