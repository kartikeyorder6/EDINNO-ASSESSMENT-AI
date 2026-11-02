"""
drive.py - FastAPI router for Google Drive Centralized Workspace integration.
"""

from __future__ import annotations

import urllib.parse
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse, StreamingResponse

from app.core.config import settings
from app.core.logging import logger
from app.schemas.drive import (
    DriveFileItem,
    DriveFileListResponse,
    DriveFileMoveRequest,
    DriveFileRenameRequest,
    DriveFolderCreateRequest,
    DrivePermissionItem,
    DriveShareRequest,
    DriveSyncResponse,
    DriveSyncStatusResponse,
)
from app.services.google_drive_service import google_drive_service

router = APIRouter(prefix="/drive", tags=["Google Drive Workspace"])


@router.get("/status", response_model=DriveSyncStatusResponse)
async def get_drive_workspace_status():
    """Returns workspace health, configuration state, and storage quota."""
    refresh_token = getattr(settings, "GOOGLE_DRIVE_REFRESH_TOKEN", None)
    if not refresh_token:
        # Check disk in case it was written during runtime
        from pathlib import Path
        env_file = Path(__file__).resolve().parents[3] / ".env"
        if env_file.is_file():
            try:
                for line in env_file.read_text(encoding="utf-8").splitlines():
                    if line.startswith("GOOGLE_DRIVE_REFRESH_TOKEN="):
                        val = line.split("=", 1)[1].strip()
                        if val:
                            settings.GOOGLE_DRIVE_REFRESH_TOKEN = val
                            google_drive_service._initialize_client()
                            refresh_token = val
                            break
            except Exception:
                pass

    quota = google_drive_service.get_storage_quota()
    root_id = google_drive_service.get_workspace_root_id()
    root_name = "EDINNO STEM Studio Workspace"

    has_oauth = bool(refresh_token)
    return DriveSyncStatusResponse(
        is_configured=google_drive_service.is_configured(),
        is_oauth_connected=has_oauth,
        auth_type="oauth" if has_oauth else "service_account",
        service_account_email=google_drive_service.get_service_account_email(),
        root_folder_id=root_id,
        root_folder_name=root_name,
        quota_bytes_used=quota.get("quota_bytes_used"),
        quota_bytes_total=quota.get("quota_bytes_total"),
        quota_readable=quota.get("quota_readable"),
        last_reconciled_at=None,
    )


@router.get("/files", response_model=DriveFileListResponse)
async def list_drive_files(
    folder_id: Optional[str] = Query(None, description="Folder ID to explore; defaults to Workspace Root"),
    search: Optional[str] = Query(None, description="Search keyword matching file names"),
    mime_type: Optional[str] = Query(None, description="Filter by MIME type"),
    page_size: int = Query(50, ge=1, le=100),
    page_token: Optional[str] = Query(None, description="Pagination cursor"),
):
    """List files and folders within a folder with search and pagination."""
    try:
        return google_drive_service.list_files(
            folder_id=folder_id,
            search=search,
            mime_type=mime_type,
            page_size=page_size,
            page_token=page_token,
        )
    except Exception as exc:
        logger.error(f"Error listing files: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.post("/folders", response_model=DriveFileItem)
async def create_drive_folder(payload: DriveFolderCreateRequest):
    """Create a new folder in Google Drive."""
    try:
        return google_drive_service.create_folder(name=payload.name, parent_id=payload.parent_id)
    except Exception as exc:
        logger.error(f"Folder creation failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.post("/files/upload", response_model=DriveFileItem)
async def upload_drive_file(
    file: UploadFile = File(...),
    parent_id: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
):
    """Upload a file directly to Google Drive."""
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    try:
        return google_drive_service.upload_file(
            content=content,
            filename=file.filename or "upload.bin",
            mime_type=file.content_type,
            parent_id=parent_id,
            description=description,
        )
    except Exception as exc:
        logger.error(f"File upload failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.get("/files/{file_id}", response_model=DriveFileItem)
async def get_drive_file_metadata(file_id: str):
    """Retrieve metadata for a file or folder."""
    try:
        return google_drive_service.get_file_metadata(file_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/files/{file_id}/download")
async def download_drive_file(file_id: str):
    """Stream download a file from Google Drive."""
    try:
        stream, filename, mime_type = google_drive_service.get_file_stream(file_id)
        encoded_fn = urllib.parse.quote(filename)
        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_fn}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        }
        return StreamingResponse(stream, media_type=mime_type, headers=headers)
    except Exception as exc:
        logger.error(f"Download failed for {file_id}: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.patch("/files/{file_id}/rename", response_model=DriveFileItem)
async def rename_drive_file(file_id: str, payload: DriveFileRenameRequest):
    """Rename a file or folder."""
    try:
        return google_drive_service.rename_file(file_id=file_id, new_name=payload.name)
    except Exception as exc:
        logger.error(f"Rename failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.patch("/files/{file_id}/move", response_model=DriveFileItem)
async def move_drive_file(file_id: str, payload: DriveFileMoveRequest):
    """Move a file to another folder in Google Drive."""
    try:
        return google_drive_service.move_file(file_id=file_id, new_parent_id=payload.destination_folder_id)
    except Exception as exc:
        logger.error(f"Move failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.delete("/files/{file_id}")
async def trash_drive_file(file_id: str, permanent: bool = Query(False)):
    """Move file to trash, or permanently delete."""
    try:
        if permanent:
            success = google_drive_service.delete_file_permanently(file_id)
        else:
            success = google_drive_service.trash_file(file_id)
        return {"success": success, "file_id": file_id, "permanent": permanent}
    except Exception as exc:
        logger.error(f"Delete failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# OAuth 2.0 Web Authorization Flow
# ---------------------------------------------------------------------------


@router.get("/auth/login")
async def drive_oauth_login(
    redirect_uri: Optional[str] = Query(None, description="Custom OAuth redirect URI"),
    json_mode: bool = Query(False, description="Return auth URL as JSON instead of redirect"),
):
    """
    Initiate Google OAuth 2.0 Web flow for Centralized Workspace authorization.
    Redirects user to Google's consent screen.
    """
    try:
        url = google_drive_service.get_authorization_url(redirect_uri=redirect_uri)
        if json_mode:
            return {"authorization_url": url}
        return RedirectResponse(url=url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    except Exception as exc:
        logger.error(f"Failed to generate OAuth authorization URL: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.get("/auth/callback")
async def drive_oauth_callback(
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
):
    """
    Google OAuth 2.0 callback endpoint.
    Exchanges code for persistent refresh token and redirects back to Next.js Drive workspace.
    """
    if error:
        logger.warning(f"Google OAuth authorization returned error: {error}")
        return RedirectResponse(
            url=f"http://localhost:3000/drive?error={urllib.parse.quote(error)}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing authorization code.")

    try:
        result = google_drive_service.exchange_authorization_code(code=code, state=state)
        email = result.get("email") or ""
        return RedirectResponse(
            url=f"http://localhost:3000/drive?connected=true&email={urllib.parse.quote(email)}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )
    except Exception as exc:
        logger.error(f"Failed exchanging Google OAuth authorization code: {exc}")
        return RedirectResponse(
            url=f"http://localhost:3000/drive?error={urllib.parse.quote(str(exc))}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )


@router.post("/auth/disconnect")
async def drive_disconnect():
    """Disconnect Google Drive workspace and clear tokens."""
    try:
        google_drive_service.disconnect()
        return {"status": "disconnected"}
    except Exception as exc:
        logger.error(f"Error disconnecting Google Drive: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Permissions & Collaborative Sharing
# ---------------------------------------------------------------------------


@router.get("/files/{file_id}/permissions", response_model=list[DrivePermissionItem])
async def list_drive_permissions(file_id: str):
    """List collaborators and permissions for a file or folder."""
    return google_drive_service.list_permissions(file_id)


@router.post("/files/{file_id}/permissions", response_model=DrivePermissionItem)
async def share_drive_file(file_id: str, payload: DriveShareRequest):
    """Share file or folder with a collaborator email address."""
    try:
        return google_drive_service.create_permission(
            file_id=file_id,
            email=payload.email,
            role=payload.role,
            send_notification_email=payload.send_notification_email,
        )
    except Exception as exc:
        logger.error(f"Share failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.delete("/files/{file_id}/permissions/{permission_id}")
async def revoke_drive_permission(file_id: str, permission_id: str):
    """Revoke a collaborator's access to a file or folder."""
    try:
        success = google_drive_service.delete_permission(file_id, permission_id)
        return {"success": success, "permission_id": permission_id}
    except Exception as exc:
        logger.error(f"Permission revoke failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Bidirectional Synchronization & Change Tokens
# ---------------------------------------------------------------------------


@router.get("/sync/changes", response_model=DriveSyncResponse)
async def get_drive_changes(
    page_token: Optional[str] = Query(None, description="Cursor token; omit to get initial cursor"),
):
    """Query incremental file changes from Google Drive since last page token."""
    token = page_token or google_drive_service.get_start_page_token()
    return google_drive_service.list_changes(token)


@router.post("/sync/webhook")
async def google_drive_push_webhook():
    """
    Receiver endpoint for Google Drive push change notifications (changes.watch).
    Acknowledges notification immediately with 200 OK.
    """
    logger.info("Received Google Drive push notification webhook.")
    return {"status": "received"}

