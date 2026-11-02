"""
storage.py - Pydantic schemas for Cloudinary PDF asset management.
Organizes curriculum PDFs by Grade and Category with asset metadata and secure delivery.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CloudinaryAsset(BaseModel):
    id: str = Field(description="Unique internal ID (UUID)")
    public_id: str = Field(description="Cloudinary Public ID")
    asset_id: Optional[str] = Field(default=None, description="Cloudinary Asset ID")
    grade: int = Field(ge=6, le=12, description="Target Grade (6-12)")
    chapter: str = Field(description="Chapter title or module group")
    category: str = Field(description="Category: Topic, Activity, Project, Reference")
    title: str = Field(description="Display title of the PDF")
    original_filename: str = Field(description="Original filename before upload")
    file_size_bytes: int = Field(ge=0, description="Size in bytes")
    mime_type: str = Field(default="application/pdf", description="MIME type")
    secure_url: str = Field(description="HTTPS Cloudinary delivery URL")
    preview_url: Optional[str] = Field(default=None, description="Cloudinary preview or page 1 thumbnail URL")
    version: int = Field(default=1, description="Asset revision version")
    sha256_hash: Optional[str] = Field(default=None, description="SHA-256 content checksum for deduplication")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Extracted metadata (pages, ocr preview, etc.)")
    created_at: str = Field(description="ISO timestamp")
    updated_at: str = Field(description="ISO timestamp")


class CloudinaryAssetListResponse(BaseModel):
    success: bool = True
    total: int
    page: int = 1
    page_size: int = 50
    items: List[CloudinaryAsset]


class CloudinaryUploadResponse(BaseModel):
    success: bool = True
    message: str
    asset: CloudinaryAsset
    duplicate_detected: bool = False


class CloudinaryConfigStatus(BaseModel):
    configured: bool
    cloud_name: Optional[str] = None
    folder_prefix: str
    max_file_size_bytes: int

