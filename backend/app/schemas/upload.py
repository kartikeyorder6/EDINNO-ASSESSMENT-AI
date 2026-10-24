"""upload.py - Schemas for the curriculum upload API."""

from __future__ import annotations

from typing import Dict, Optional

from pydantic import BaseModel, Field


class ResourceMetadata(BaseModel):
    name: str
    page_count: int = Field(ge=0)
    char_count: int = Field(ge=0)
    preview: str
    category: Optional[str] = "topic"


class UploadResponse(BaseModel):
    success: bool
    message: str
    count: int = Field(ge=0)
    resources: Dict[str, str] = Field(default_factory=dict)
    metadata: Optional[Dict[str, ResourceMetadata]] = None


class DetectProjectResponse(BaseModel):
    success: bool
    project_name: str
    confidence: Optional[float] = Field(default=1.0, ge=0.0, le=1.0)