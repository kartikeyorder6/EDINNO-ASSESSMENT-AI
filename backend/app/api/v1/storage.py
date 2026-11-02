"""
storage.py - FastAPI endpoints for Cloudinary PDF asset storage and management.
Enforces file-type and size validation, category and grade filtering, duplicate handling,
and secure asset CRUD operations.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.api.common import http_error, read_upload_limited, safe_basename
from app.core.config import settings
from app.core.logging import logger
from app.schemas.storage import (
    CloudinaryAsset,
    CloudinaryAssetListResponse,
    CloudinaryConfigStatus,
    CloudinaryUploadResponse,
)
from app.services.cloudinary_service import cloudinary_storage_service
from app.services.curriculum_service import curriculum_service

router = APIRouter(prefix="/storage")


@router.get("/config-status", response_model=CloudinaryConfigStatus)
async def get_storage_config_status():
    """Check Cloudinary configuration status without exposing credentials."""
    return cloudinary_storage_service.get_status()


@router.post("/upload", response_model=CloudinaryUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_curriculum_pdf(
    file: UploadFile = File(...),
    grade: int = Form(..., ge=6, le=12, description="Target Grade (6-12)"),
    chapter: str = Form(..., min_length=2, description="Chapter title"),
    category: str = Form("Topic", description="Category: Topic, Activity, Project, Reference"),
    title: Optional[str] = Form(None, description="Human readable title"),
    overwrite: bool = Form(True, description="Whether to overwrite duplicate filename/slug"),
):
    """
    Securely upload a curriculum PDF to Cloudinary organized by Grade and Category.
    Stores asset metadata and URLs in SQLite database.
    """
    filename = safe_basename(file.filename or "curriculum_document.pdf")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await read_upload_limited(file, settings.PDF_MAX_BYTES, name=filename)
        asset, is_duplicate = await cloudinary_storage_service.upload_pdf(
            file_bytes=content,
            filename=filename,
            grade=grade,
            chapter=chapter.strip(),
            category=category.strip(),
            title=title.strip() if title else None,
            overwrite=overwrite,
        )
        msg = "Asset uploaded successfully to Cloudinary." if cloudinary_storage_service.is_configured() else "Asset staged locally (Cloudinary offline)."
        if is_duplicate:
            msg = "Duplicate PDF detected; existing asset record returned."

        return CloudinaryUploadResponse(
            success=True,
            message=msg,
            asset=asset,
            duplicate_detected=is_duplicate,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise http_error(exc, "upload_curriculum_pdf", "PDF upload failed") from exc
    finally:
        await file.close()


@router.get("/assets", response_model=CloudinaryAssetListResponse)
async def list_curriculum_pdf_assets(
    grade: Optional[int] = Query(None, ge=6, le=12, description="Filter by grade"),
    category: Optional[str] = Query(None, description="Filter by category (Topic, Activity, Project, Reference)"),
    chapter: Optional[str] = Query(None, description="Filter by chapter name"),
    search: Optional[str] = Query(None, description="Search keyword in title, chapter, or filename"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=500, description="Page size"),
):
    """Retrieve filtered curriculum PDF assets organized by Grade and Category."""
    items, total = curriculum_service.list_pdf_assets(
        grade=grade,
        category=category,
        chapter=chapter,
        search=search,
        page=page,
        page_size=page_size,
    )
    return CloudinaryAssetListResponse(
        success=True,
        total=total,
        page=page,
        page_size=page_size,
        items=items,
    )


@router.get("/assets/{asset_id}", response_model=CloudinaryAsset)
async def get_curriculum_pdf_asset(asset_id: str):
    """Retrieve single PDF asset by internal ID or Cloudinary Public ID."""
    asset = curriculum_service.get_pdf_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Curriculum PDF asset not found.")
    return asset


@router.put("/assets/{asset_id}/replace", response_model=CloudinaryUploadResponse)
async def replace_curriculum_pdf(
    asset_id: str,
    file: UploadFile = File(...),
):
    """Replace an existing PDF document with a new revision while preserving public ID."""
    filename = safe_basename(file.filename or "updated_document.pdf")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await read_upload_limited(file, settings.PDF_MAX_BYTES, name=filename)
        updated_asset = await cloudinary_storage_service.replace_pdf(
            asset_id=asset_id,
            file_bytes=content,
            filename=filename,
        )
        return CloudinaryUploadResponse(
            success=True,
            message="Asset replaced successfully with new version.",
            asset=updated_asset,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise http_error(exc, "replace_curriculum_pdf", "PDF replacement failed") from exc
    finally:
        await file.close()


@router.delete("/assets/{asset_id}")
async def delete_curriculum_pdf_asset(asset_id: str):
    """Delete a curriculum PDF asset from Cloudinary and SQLite database."""
    success = await cloudinary_storage_service.delete_pdf(asset_id)
    if not success:
        raise HTTPException(status_code=404, detail="Asset not found or already deleted.")
    return {"success": True, "message": "Curriculum PDF asset deleted successfully."}


@router.get("/local-files/{grade}/{category}/{filename}")
async def get_local_staged_file(grade: int, category: str, filename: str):
    """Serve locally staged PDFs when Cloudinary is in local staging mode."""
    safe_name = safe_basename(filename)
    file_path = cloudinary_storage_service.local_staging_dir / f"grade_{grade}" / category.lower() / safe_name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Staged file not found.")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=safe_name,
    )

