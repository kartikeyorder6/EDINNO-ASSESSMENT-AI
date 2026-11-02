"""
curriculum.py - Pydantic V2 schemas for the Centralized Curriculum Mind Map & Table Editor.
Strictly limited to the 6 allowed curriculum fields: count, video_id, grade, chapter, category, status.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CurriculumStatus(str, Enum):
    """Centrally configurable allowed workflow statuses."""
    NOT_STARTED = "Not Started"
    IN_PROGRESS = "In Progress"
    DONE = "Done"
    ON_HOLD = "On Hold"


# Normalized status lookup map for import & data migration tolerance
_STATUS_MAP = {
    "not started": CurriculumStatus.NOT_STARTED,
    "notstarted": CurriculumStatus.NOT_STARTED,
    "todo": CurriculumStatus.NOT_STARTED,
    "in progress": CurriculumStatus.IN_PROGRESS,
    "inprogress": CurriculumStatus.IN_PROGRESS,
    "doing": CurriculumStatus.IN_PROGRESS,
    "active": CurriculumStatus.IN_PROGRESS,
    "done": CurriculumStatus.DONE,
    "completed": CurriculumStatus.DONE,
    "finished": CurriculumStatus.DONE,
    "on hold": CurriculumStatus.ON_HOLD,
    "onhold": CurriculumStatus.ON_HOLD,
    "paused": CurriculumStatus.ON_HOLD,
    "blocked": CurriculumStatus.ON_HOLD,
}


def normalize_status(val: Any) -> Optional[CurriculumStatus]:
    """Helper to map legacy/import string values to a valid CurriculumStatus."""
    if not val:
        return CurriculumStatus.NOT_STARTED
    raw = str(val).strip()
    # Check exact enum value match first
    for s in CurriculumStatus:
        if raw == s.value:
            return s
    # Check normalized lookup
    return _STATUS_MAP.get(raw.lower())


# ---------------------------------------------------------------------------
# Core 6-Field Schemas
# ---------------------------------------------------------------------------


class CurriculumRecordBase(BaseModel):
    """The 6 mandatory fields defining a curriculum record."""
    count: int = Field(..., ge=1, description="Sequence record index")
    video_id: str = Field(..., min_length=1, max_length=100, description="Unique curriculum identifier")
    grade: int = Field(..., ge=1, le=12, description="School grade level (6-12)")
    chapter: str = Field(..., min_length=1, max_length=200, description="Curriculum chapter name")
    category: str = Field(..., min_length=1, max_length=100, description="Component type / category")
    status: CurriculumStatus = Field(default=CurriculumStatus.NOT_STARTED, description="Current workflow status")

    model_config = ConfigDict(from_attributes=True)

    @field_validator("video_id", mode="before")
    @classmethod
    def clean_video_id(cls, v: Any) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("video_id cannot be blank")
        return s

    @field_validator("chapter", mode="before")
    @classmethod
    def clean_chapter(cls, v: Any) -> str:
        s = str(v).strip()
        if not s:
            raise ValueError("chapter cannot be empty")
        return s

    @field_validator("category", mode="before")
    @classmethod
    def clean_category(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        if not s:
            return "Topic"
        s_lower = s.lower()
        if "activ" in s_lower or "lab" in s_lower:
            return "Activity"
        if "proj" in s_lower or "capstone" in s_lower:
            return "Project"
        return "Topic"

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: Any) -> CurriculumStatus:
        if isinstance(v, CurriculumStatus):
            return v
        norm = normalize_status(v)
        if not norm:
            allowed = [s.value for s in CurriculumStatus]
            raise ValueError(f"Invalid status '{v}'. Allowed values are: {', '.join(allowed)}")
        return norm


class CurriculumRecordCreate(CurriculumRecordBase):
    """Payload for creating a new curriculum record."""
    pass


class CurriculumRecordUpdate(BaseModel):
    """Payload for updating a curriculum record (partial updates allowed)."""
    count: Optional[int] = Field(None, ge=1)
    grade: Optional[int] = Field(None, ge=1, le=12)
    chapter: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[CurriculumStatus] = None
    expected_version: Optional[int] = Field(None, description="Optimistic concurrency control token")

    model_config = ConfigDict(from_attributes=True)

    @field_validator("category", mode="before")
    @classmethod
    def clean_category(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        s_lower = s.lower()
        if "activ" in s_lower or "lab" in s_lower:
            return "Activity"
        if "proj" in s_lower or "capstone" in s_lower:
            return "Project"
        return "Topic"

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: Any) -> Optional[CurriculumStatus]:
        if v is None:
            return None
        if isinstance(v, CurriculumStatus):
            return v
        norm = normalize_status(v)
        if not norm:
            allowed = [s.value for s in CurriculumStatus]
            raise ValueError(f"Invalid status '{v}'. Allowed values are: {', '.join(allowed)}")
        return norm


class CurriculumRecord(CurriculumRecordBase):
    """Persisted curriculum record with revision & timestamp metadata."""
    version: int = Field(default=1, description="Incrementing revision counter for concurrency control")
    created_at: str = Field(description="ISO 8601 creation timestamp")
    updated_at: str = Field(description="ISO 8601 last modified timestamp")


# ---------------------------------------------------------------------------
# Query & Bulk Operation Schemas
# ---------------------------------------------------------------------------


class CurriculumListResponse(BaseModel):
    """Paginated list of curriculum records."""
    records: List[CurriculumRecord]
    total: int
    page: int
    page_size: int
    total_pages: int


class CurriculumBulkStatusRequest(BaseModel):
    """Request payload for bulk status transitions."""
    video_ids: List[str] = Field(..., min_length=1, description="List of unique video IDs to transition")
    status: CurriculumStatus = Field(..., description="Target workflow status")


class CurriculumBulkDeleteRequest(BaseModel):
    """Request payload for bulk deletions."""
    video_ids: List[str] = Field(..., min_length=1, description="List of unique video IDs to delete")


class CurriculumSummaryResponse(BaseModel):
    """High-level metrics and status breakdowns."""
    total_records: int
    by_status: Dict[str, int]
    by_grade: Dict[str, int]
    by_category: Dict[str, int]


# ---------------------------------------------------------------------------
# Hierarchy & Mind Map Schemas
# ---------------------------------------------------------------------------


class CurriculumHierarchyNode(BaseModel):
    """Tree node for hierarchical Mind Map (Grade -> Chapter -> Category -> Record)."""
    id: str
    name: str
    node_type: str  # "root" | "grade" | "chapter" | "category" | "record"
    count: int = 0
    status: Optional[CurriculumStatus] = None
    status_counts: Dict[str, int] = Field(default_factory=dict)
    record: Optional[CurriculumRecord] = None
    children: List[CurriculumHierarchyNode] = Field(default_factory=list)


class CurriculumHierarchyResponse(BaseModel):
    """Complete curriculum hierarchy tree."""
    root: CurriculumHierarchyNode
    total_records: int


# ---------------------------------------------------------------------------
# CSV Import & Audit Trail Schemas
# ---------------------------------------------------------------------------


class CurriculumImportRowValidation(BaseModel):
    """Single row validation result for CSV import preview."""
    row_number: int
    is_valid: bool
    record: Optional[CurriculumRecordBase] = None
    errors: List[str] = Field(default_factory=list)
    ignored_obsolete_fields: List[str] = Field(default_factory=list)


class CurriculumImportPreviewResponse(BaseModel):
    """Comprehensive validation preview before committing an import."""
    total_rows: int
    valid_count: int
    error_count: int
    previews: List[CurriculumImportRowValidation]


class CurriculumImportCommitRequest(BaseModel):
    """Payload to commit validated records into the database."""
    records: List[CurriculumRecordCreate]
    mode: str = Field(default="upsert", description="'upsert' updates existing video_ids, 'skip' ignores existing")


class CurriculumImportCommitResponse(BaseModel):
    """Result of committing an import batch."""
    created_count: int
    updated_count: int
    skipped_count: int
    error_count: int
    errors: List[str] = Field(default_factory=list)


class CurriculumAuditLogItem(BaseModel):
    """Audit trail entry tracking who changed what and when."""
    id: str
    video_id: str
    action: str  # "CREATE" | "UPDATE" | "DELETE" | "BULK_STATUS" | "IMPORT"
    user_id: Optional[str] = None
    previous_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    timestamp: str

