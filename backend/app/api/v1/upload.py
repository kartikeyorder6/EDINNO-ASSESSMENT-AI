import re
import json
from typing import Dict, List, Optional
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from app.core.logging import logger
from app.schemas.upload import UploadResponse, ResourceMetadata, DetectProjectResponse
from app.services.pdf_reader import extract_pdf_text_with_meta
from app.services.ai_generator import detect_project_title

router = APIRouter()


from app.core.config import settings

def detect_file_category(filename: str, text: str = "") -> str:
    """
    Categorize curriculum documents into: topic, activity, project, resource.
    Inspects both filename and initial content text.
    """
    fn = filename.lower()
    t = (text[:2000] if text else "").lower()

    if "activit" in fn or "lab" in fn or "experiment" in fn or "activity" in t or "experiment" in t:
        return "activity"
    if "project" in fn or re.search(r"\bp-\d+\b", fn) or "capstone" in fn or "project:" in t or "project -" in t:
        return "project"
    if "topic" in fn or "module" in fn or "lesson" in fn or "unit" in fn or "module " in t or "lesson " in t:
        return "topic"
    return "resource"


@router.post("/upload-pdfs", response_model=UploadResponse)
async def upload_pdfs(
    files: List[UploadFile] = File(...),
    category_map: Optional[str] = Form(None)
):
    """
    Ingest multiple curriculum PDFs (Topics, Activities, Projects, Chapter Quiz, Extra Resources).
    Extracts text per document and returns structured dictionary with categorized metadata.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    custom_categories: Dict[str, str] = {}
    if category_map:
        try:
            custom_categories = json.loads(category_map)
        except Exception:
            pass

    extracted_resources: Dict[str, str] = {}
    metadata_map: Dict[str, ResourceMetadata] = {}

    for file in files:
        filename = file.filename or "Unnamed.pdf"
        try:
            content = await file.read()
            if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File {filename} exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB."
                )

            text, page_count = extract_pdf_text_with_meta(content)
            
            # Key name based on filename without .pdf, handling duplicate collisions
            base_key = filename.replace(".pdf", "").replace(".PDF", "").strip() or "document"
            key = base_key
            dup_idx = 2
            while key in extracted_resources:
                key = f"{base_key}_{dup_idx}"
                dup_idx += 1

            category = custom_categories.get(filename) or custom_categories.get(key) or detect_file_category(filename, text)

            extracted_resources[key] = text
            metadata_map[key] = ResourceMetadata(
                name=filename,
                page_count=page_count,
                char_count=len(text),
                preview=text[:200].replace("\n", " ").strip() + "...",
                category=category
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error reading {filename}: {e}")
            raise HTTPException(status_code=422, detail=f"Failed to parse {filename}: {str(e)}")

    return UploadResponse(
        success=True,
        message=f"Successfully extracted {len(extracted_resources)} curriculum documents.",
        count=len(extracted_resources),
        resources=extracted_resources,
        metadata=metadata_map
    )


@router.post("/detect-project-name", response_model=DetectProjectResponse)
async def detect_project_name(file: UploadFile = File(...)):
    """
    Automatically detects formal project or activity name from first pages of PDF.
    """
    try:
        content = await file.read()
        text, _ = extract_pdf_text_with_meta(content)
        title = detect_project_title(text, filename=file.filename or "")
        return DetectProjectResponse(success=True, project_name=title)
    except Exception as e:
        logger.error(f"Project detection error: {e}")
        return DetectProjectResponse(success=False, project_name="STEM Curriculum Project")
