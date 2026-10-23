from typing import Dict, Optional, Any
from pydantic import BaseModel, Field


class ResourceMetadata(BaseModel):
    name: str
    page_count: int
    char_count: int
    preview: str
    category: Optional[str] = "topic"


class UploadResponse(BaseModel):
    success: bool
    message: str
    count: int
    resources: Dict[str, str] = Field(default_factory=dict)
    metadata: Optional[Dict[str, ResourceMetadata]] = None


class DetectProjectResponse(BaseModel):
    success: bool
    project_name: str
    confidence: Optional[float] = 1.0
