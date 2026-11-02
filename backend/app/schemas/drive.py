"""
drive.py - Schemas for Google Drive Centralized Workspace API.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DriveFileItem(BaseModel):
    id: str
    name: str
    mime_type: str
    size_bytes: Optional[int] = 0
    is_folder: bool = False
    parent_id: Optional[str] = None
    web_view_link: Optional[str] = None
    web_content_link: Optional[str] = None
    thumbnail_link: Optional[str] = None
    icon_link: Optional[str] = None
    created_time: Optional[str] = None
    modified_time: Optional[str] = None
    version: Optional[str] = None
    md5_checksum: Optional[str] = None
    owners: List[Dict[str, Any]] = Field(default_factory=list)
    shared: bool = False
    can_edit: bool = True
    description: Optional[str] = None


class BreadcrumbItem(BaseModel):
    id: str
    name: str


class DriveFileListResponse(BaseModel):
    files: List[DriveFileItem]
    next_page_token: Optional[str] = None
    current_folder_id: Optional[str] = None
    current_folder_name: Optional[str] = None
    breadcrumbs: List[BreadcrumbItem] = Field(default_factory=list)
    total_count: int = 0


class DriveFolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: Optional[str] = None


class DriveFileRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class DriveFileMoveRequest(BaseModel):
    destination_folder_id: str


class DrivePermissionItem(BaseModel):
    id: str
    role: str
    type: str
    email_address: Optional[str] = None
    display_name: Optional[str] = None
    photo_link: Optional[str] = None


class DriveShareRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    role: str = Field(default="reader", pattern="^(reader|commenter|writer)$")
    send_notification_email: bool = True


class DriveSyncStatusResponse(BaseModel):
    is_configured: bool
    is_oauth_connected: bool = False
    auth_type: str = "service_account"
    service_account_email: Optional[str] = None
    root_folder_id: Optional[str] = None
    root_folder_name: Optional[str] = None
    quota_bytes_used: Optional[int] = None
    quota_bytes_total: Optional[int] = None
    quota_readable: Optional[str] = None
    last_reconciled_at: Optional[str] = None


class DriveChangeDeltaItem(BaseModel):
    change_type: str = "file"
    file_id: str
    removed: bool = False
    file: Optional[DriveFileItem] = None
    time: Optional[str] = None


class DriveSyncResponse(BaseModel):
    changes: List[DriveChangeDeltaItem] = Field(default_factory=list)
    new_start_page_token: str
    has_more_changes: bool = False

