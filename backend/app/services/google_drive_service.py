"""
google_drive_service.py - Production Google Drive API v3 Service for Centralized Workspaces.

Supports Google Cloud Service Accounts, Domain-Wide Delegation for Google Workspace Pro,
folder hierarchy traversal, chunked/resumable uploads, direct streaming downloads,
collaborative permission management, and change token bidirectional synchronization.
"""

from __future__ import annotations

import io
import json
import mimetypes
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.logging import logger
from app.schemas.drive import (
    BreadcrumbItem,
    DriveChangeDeltaItem,
    DriveFileItem,
    DriveFileListResponse,
    DrivePermissionItem,
    DriveSyncResponse,
)

# MIME types
FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"

DEFAULT_FIELDS = (
    "id, name, mimeType, size, parents, webViewLink, webContentLink, "
    "thumbnailLink, iconLink, createdTime, modifiedTime, version, md5Checksum, "
    "owners(displayName, emailAddress, photoLink), shared, capabilities/canEdit, description, trashed"
)


class GoogleDriveService:
    """Thread-safe Google Drive API v3 wrapper for Centralized Workspace operations."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._service: Optional[Any] = None
        self._service_account_email: Optional[str] = None
        self._workspace_root_id: Optional[str] = None
        self._initialized = False

        # In-memory storage cache used for offline local test / dev mode when credentials aren't staged
        self._in_memory_files: Dict[str, Dict[str, Any]] = {}
        self._in_memory_binaries: Dict[str, bytes] = {}
        self._in_memory_permissions: Dict[str, List[Dict[str, Any]]] = {}
        self._in_memory_changes: List[Dict[str, Any]] = []
        self._sync_token_counter = 1000
        self._oauth_verifiers: Dict[str, str] = {}
        self._cached_quota: Optional[Dict[str, Any]] = None
        self._cached_quota_time: float = 0.0
        self._workspace_root_verified_at: float = 0.0

        self._initialize_client()

    def _initialize_client(self) -> None:
        """Attempt to construct authenticated Google Drive v3 client from Service Account."""
        with self._lock:
            if not getattr(settings, "GOOGLE_DRIVE_ENABLED", True):
                logger.info("Google Drive integration disabled in settings.")
                return

            creds = None
            refresh_token = getattr(settings, "GOOGLE_DRIVE_REFRESH_TOKEN", None)
            if not refresh_token:
                # Read directly from .env in case it was updated by OAuth callback while process was running
                env_file = Path(__file__).resolve().parents[2] / ".env"
                if env_file.is_file():
                    try:
                        for line in env_file.read_text(encoding="utf-8").splitlines():
                            if line.startswith("GOOGLE_DRIVE_REFRESH_TOKEN="):
                                val = line.split("=", 1)[1].strip()
                                if val:
                                    refresh_token = val
                                    settings.GOOGLE_DRIVE_REFRESH_TOKEN = val
                                    break
                    except Exception:
                        pass

            client_id = getattr(settings, "GOOGLE_CLIENT_ID", None)
            client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", None)
            raw_json = getattr(settings, "GOOGLE_SERVICE_ACCOUNT_JSON", None)
            json_path = getattr(settings, "GOOGLE_SERVICE_ACCOUNT_PATH", None)
            delegated_user = getattr(settings, "GOOGLE_DRIVE_DELEGATED_USER", None)

            # 1. Prioritize OAuth 2.0 user credentials (full storage quota)
            if refresh_token and client_id and client_secret:
                try:
                    from google.oauth2.credentials import Credentials

                    scopes = ["https://www.googleapis.com/auth/drive"]
                    creds = Credentials(
                        token=None,
                        refresh_token=refresh_token,
                        token_uri="https://oauth2.googleapis.com/token",
                        client_id=client_id,
                        client_secret=client_secret,
                        scopes=scopes,
                    )
                    logger.info("Loaded Google Drive OAuth 2.0 credentials from refresh token.")
                except Exception as exc:
                    logger.warning(f"Failed to load OAuth 2.0 credentials from refresh token: {exc}")

            # 2. Try raw JSON string from environment
            if creds is None and raw_json and raw_json.strip():
                try:
                    info = json.loads(raw_json.strip())
                    from google.oauth2 import service_account

                    scopes = ["https://www.googleapis.com/auth/drive"]
                    creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
                    self._service_account_email = info.get("client_email")
                    logger.info("Loaded Google Service Account from GOOGLE_SERVICE_ACCOUNT_JSON")
                except Exception as exc:
                    logger.warning(f"Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: {exc}")

            # 3. Try file path
            if creds is None and json_path:
                p = Path(json_path)
                if not p.is_absolute():
                    p = Path(__file__).resolve().parents[2] / json_path
                if p.is_file():
                    try:
                        from google.oauth2 import service_account

                        scopes = ["https://www.googleapis.com/auth/drive"]
                        creds = service_account.Credentials.from_service_account_file(str(p), scopes=scopes)
                        with open(p, "r", encoding="utf-8") as f:
                            self._service_account_email = json.load(f).get("client_email")
                        logger.info(f"Loaded Google Service Account from {p}")
                    except Exception as exc:
                        logger.warning(f"Failed to load service account file {p}: {exc}")

            # 4. Apply Domain-Wide Delegation if configured for Google Workspace Pro
            if creds and delegated_user and hasattr(creds, "with_subject"):
                try:
                    creds = creds.with_subject(delegated_user)
                    logger.info(f"Configured Google Workspace domain-wide delegation for {delegated_user}")
                except Exception as exc:
                    logger.warning(f"Failed to delegate user {delegated_user}: {exc}")

            # 5. Build API resource
            if creds:
                try:
                    from googleapiclient.discovery import build

                    self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
                    self._initialized = True
                    logger.info("Google Drive v3 API client successfully initialized.")
                    if not self._service_account_email:
                        try:
                            about = self._service.about().get(fields="user(displayName,emailAddress)").execute()
                            self._service_account_email = about.get("user", {}).get("emailAddress")
                        except Exception:
                            pass
                except Exception as exc:
                    logger.error(f"Failed to build Google Drive client: {exc}")

            # Workspace root directory configuration
            configured_root = getattr(settings, "GOOGLE_DRIVE_WORKSPACE_ROOT_ID", None)
            if configured_root:
                self._workspace_root_id = configured_root
            elif not self._initialized:
                # Seed default in-memory workspace structure for local zero-credential mode
                self._seed_default_workspace()

    def is_configured(self) -> bool:
        """True if authenticated with real Google Cloud credentials."""
        return self._service is not None

    def get_service_account_email(self) -> Optional[str]:
        return self._service_account_email

    # ---------------------------------------------------------------------------
    # OAuth 2.0 Web Authorization Flow
    # ---------------------------------------------------------------------------

    def get_authorization_url(self, redirect_uri: Optional[str] = None) -> str:
        """Generate Google OAuth 2.0 authorization URL requesting offline access (refresh token)."""
        client_id = getattr(settings, "GOOGLE_CLIENT_ID", None)
        client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", None)
        if not client_id or not client_secret:
            raise ValueError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.")

        import secrets
        import urllib.parse

        target_redirect = redirect_uri or getattr(
            settings, "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/drive/auth/callback"
        )
        state = secrets.token_urlsafe(24)

        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": target_redirect,
            "scope": "https://www.googleapis.com/auth/drive",
            "state": state,
            "access_type": "offline",
            "prompt": "consent select_account",
            "include_granted_scopes": "true",
        }
        return "https://accounts.google.com/o/oauth2/auth?" + urllib.parse.urlencode(params)

    def exchange_authorization_code(
        self,
        code: str,
        state: Optional[str] = None,
        redirect_uri: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Exchange authorization code directly for refresh & access tokens and initialize Drive service."""
        client_id = getattr(settings, "GOOGLE_CLIENT_ID", None)
        client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", None)
        if not client_id or not client_secret:
            raise ValueError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.")

        import json
        import urllib.request
        import urllib.parse
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        target_redirect = redirect_uri or getattr(
            settings, "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/drive/auth/callback"
        )

        token_url = "https://oauth2.googleapis.com/token"
        payload = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": target_redirect,
            "grant_type": "authorization_code",
        }

        # If a verifier was stored for this state, supply it as well
        verifier = self._oauth_verifiers.pop(state, None) if state else None
        if not verifier and self._oauth_verifiers:
            verifier = list(self._oauth_verifiers.values())[-1]
        if verifier:
            payload["code_verifier"] = verifier

        data = urllib.parse.urlencode(payload).encode("utf-8")
        req = urllib.request.Request(
            token_url,
            data=data,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "EDINNO-Drive-Integration/1.0",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                token_data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            logger.error(f"Google token endpoint error: {exc.code} {err_body}")
            try:
                parsed_err = json.loads(err_body)
                desc = parsed_err.get("error_description") or parsed_err.get("error") or err_body
            except Exception:
                desc = err_body
            raise RuntimeError(f"Google OAuth token exchange failed: {desc}") from exc

        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token") or getattr(settings, "GOOGLE_DRIVE_REFRESH_TOKEN", None)

        scopes = token_data.get("scope", "https://www.googleapis.com/auth/drive").split()
        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri=token_url,
            client_id=client_id,
            client_secret=client_secret,
            scopes=scopes,
        )

        with self._lock:
            self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
            self._initialized = True

            if refresh_token:
                self._save_refresh_token_to_env(refresh_token)

            try:
                about = self._service.about().get(fields="user(displayName,emailAddress)").execute()
                self._service_account_email = about.get("user", {}).get("emailAddress")
            except Exception as exc:
                logger.warning(f"Could not fetch user profile from Drive: {exc}")

        return {
            "status": "connected",
            "email": self._service_account_email,
            "has_refresh_token": bool(refresh_token),
        }

    def disconnect(self) -> None:
        """Disconnect OAuth credentials and revert to unconfigured local workspace mode."""
        with self._lock:
            self._service = None
            self._service_account_email = None
            self._initialized = False
            self._save_refresh_token_to_env("")
            self._seed_default_workspace()

    def _save_refresh_token_to_env(self, refresh_token: str) -> None:
        """Persist refresh token into backend/.env and update active settings."""
        settings.GOOGLE_DRIVE_REFRESH_TOKEN = refresh_token or None

        # Guard: Never wipe production .env file during pytest execution
        if "PYTEST_CURRENT_TEST" in os.environ or os.environ.get("TESTING") == "true":
            logger.info("Skipping .env update during test suite execution.")
            return

        env_path = Path(__file__).resolve().parents[2] / ".env"
        if not env_path.is_file():
            return

        try:
            content = env_path.read_text(encoding="utf-8")
            line_to_add = (
                f"GOOGLE_DRIVE_REFRESH_TOKEN={refresh_token}\n"
                if refresh_token
                else "GOOGLE_DRIVE_REFRESH_TOKEN=\n"
            )
            if "GOOGLE_DRIVE_REFRESH_TOKEN=" in content:
                import re

                content = re.sub(r"GOOGLE_DRIVE_REFRESH_TOKEN=.*", line_to_add.strip(), content)
            else:
                content += f"\n{line_to_add}"
            env_path.write_text(content, encoding="utf-8")
            logger.info("Updated GOOGLE_DRIVE_REFRESH_TOKEN in .env")
        except Exception as exc:
            logger.warning(f"Could not persist refresh token to .env: {exc}")

    def _seed_default_workspace(self) -> None:
        """Seed clean in-memory root for local offline testing."""
        root_id = "edinno_workspace_root"
        self._workspace_root_id = root_id
        now = datetime.now(timezone.utc).isoformat()
        self._in_memory_files[root_id] = {
            "id": root_id,
            "name": "EDINNO STEM Studio Workspace",
            "mimeType": FOLDER_MIME_TYPE,
            "parents": [],
            "size": 0,
            "createdTime": now,
            "modifiedTime": now,
            "version": "1",
            "trashed": False,
            "owners": [{"displayName": "EDINNO Organization Admin", "emailAddress": "admin@edinno.stem"}],
            "capabilities": {"canEdit": True},
        }

    # ---------------------------------------------------------------------------
    # File & Folder Operations
    # ---------------------------------------------------------------------------

    def get_workspace_root_id(self) -> str:
        """Return root workspace folder ID, self-healing and creating it in Drive if needed."""
        if not self.is_configured():
            return "edinno_workspace_root"

        # 1. Verify configured workspace root is accessible by the current authenticated user (cached for 60s)
        now = time.monotonic()
        if self._workspace_root_id and (now - self._workspace_root_verified_at < 60.0):
            return self._workspace_root_id

        if self._workspace_root_id:
            try:
                res = (
                    self._service.files()
                    .get(
                        fileId=self._workspace_root_id,
                        fields="id, name, trashed",
                        supportsAllDrives=True,
                    )
                    .execute()
                )
                if not res.get("trashed"):
                    self._workspace_root_verified_at = now
                    return self._workspace_root_id
            except Exception as exc:
                logger.warning(
                    f"Configured workspace root {self._workspace_root_id} not accessible for active account: {exc}"
                )
                self._workspace_root_id = None

        # 2. Search for existing 'EDINNO STEM Studio Workspace' folder
        try:
            q = "mimeType = 'application/vnd.google-apps.folder' and name = 'EDINNO STEM Studio Workspace' and trashed = false"
            res = self._service.files().list(q=q, fields="files(id, name)").execute()
            files = res.get("files", [])
            if files:
                self._workspace_root_id = files[0]["id"]
                return self._workspace_root_id

            # 3. Create root folder in the user's active Drive
            metadata = {
                "name": "EDINNO STEM Studio Workspace",
                "mimeType": FOLDER_MIME_TYPE,
                "description": "Centralized EDINNO AI Assessment & STEM Hardware curriculum repository.",
            }
            folder = self._service.files().create(body=metadata, fields="id").execute()
            self._workspace_root_id = folder["id"]
            return self._workspace_root_id
        except Exception as exc:
            logger.error(f"Error resolving workspace root folder: {exc}")
            return "root"

    def list_files(
        self,
        folder_id: Optional[str] = None,
        search: Optional[str] = None,
        mime_type: Optional[str] = None,
        page_size: int = 50,
        page_token: Optional[str] = None,
    ) -> DriveFileListResponse:
        """List files and folders within a directory with search & pagination."""
        target_folder = folder_id or self.get_workspace_root_id()

        if self.is_configured():
            try:
                queries = ["trashed = false"]
                if target_folder:
                    queries.append(f"'{target_folder}' in parents")
                if search and search.strip():
                    clean_search = search.replace("'", "\\'")
                    queries.append(f"name contains '{clean_search}'")
                if mime_type and mime_type.strip():
                    queries.append(f"mimeType = '{mime_type.strip()}'")

                q_str = " and ".join(queries)
                res = (
                    self._service.files()
                    .list(
                        q=q_str,
                        pageSize=min(page_size, 100),
                        pageToken=page_token,
                        fields=f"nextPageToken, files({DEFAULT_FIELDS})",
                        orderBy="folder, modifiedTime desc, name",
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                    )
                    .execute()
                )

                raw_items = [self._format_drive_item(f) for f in res.get("files", [])]
                # Smart deduplication: eliminate 0-byte abandoned upload ghosts and duplicate folders
                deduped_items = []
                seen_keys: dict[tuple[str, bool], int] = {}
                for item in raw_items:
                    key = (item.name.strip().lower(), item.is_folder)
                    if key not in seen_keys:
                        seen_keys[key] = len(deduped_items)
                        deduped_items.append(item)
                    else:
                        existing_idx = seen_keys[key]
                        existing = deduped_items[existing_idx]
                        # If existing is 0-byte stub and current is real file (>0 bytes), replace with real file
                        if not item.is_folder and (existing.size_bytes or 0) == 0 and (item.size_bytes or 0) > 0:
                            deduped_items[existing_idx] = item
                        # If both are valid, keep the one with the latest modified time
                        elif item.modified_time and (not existing.modified_time or item.modified_time > existing.modified_time):
                            deduped_items[existing_idx] = item
                items = deduped_items
                breadcrumbs = self._get_folder_breadcrumbs(target_folder)
                try:
                    folder_meta = self.get_file_metadata(target_folder) if target_folder != "root" else None
                except Exception:
                    folder_meta = None

                return DriveFileListResponse(
                    files=items,
                    next_page_token=res.get("nextPageToken"),
                    current_folder_id=target_folder,
                    current_folder_name=folder_meta.name if folder_meta else "Workspace Root",
                    breadcrumbs=breadcrumbs,
                    total_count=len(items),
                )
            except Exception as exc:
                logger.error(f"Failed to list Drive files: {exc}")
                if "notFound" in str(exc) or "File not found" in str(exc):
                    raise RuntimeError(
                        f"Google Drive folder '{target_folder}' is not accessible. "
                        f"Please open Google Drive and share the folder with '{self._service_account_email}' as Editor."
                    ) from exc
                raise RuntimeError(f"Google Drive API error: {exc}") from exc

        # In-memory fallback
        all_items = []
        for fid, f in self._in_memory_files.items():
            if fid == target_folder or f.get("trashed"):
                continue
            parents = f.get("parents", [])
            if target_folder and target_folder not in parents:
                continue
            if search and search.lower() not in f.get("name", "").lower():
                continue
            if mime_type and f.get("mimeType") != mime_type:
                continue
            all_items.append(self._format_drive_item(f))

        # Sort: folders first, then modified desc
        all_items.sort(key=lambda x: (not x.is_folder, x.name.lower()))
        breadcrumbs = self._get_folder_breadcrumbs(target_folder)
        curr = self._in_memory_files.get(target_folder, {})

        return DriveFileListResponse(
            files=all_items,
            next_page_token=None,
            current_folder_id=target_folder,
            current_folder_name=curr.get("name", "Workspace Root"),
            breadcrumbs=breadcrumbs,
            total_count=len(all_items),
        )

    def create_folder(self, name: str, parent_id: Optional[str] = None) -> DriveFileItem:
        """Create a new folder in Google Drive (idempotent: reuses existing active folder if same name in parent)."""
        target_parent = parent_id or self.get_workspace_root_id()
        clean_name = name.strip()

        if self.is_configured():
            try:
                # Deduplication check: re-use existing active folder with the same name
                clean_escaped = clean_name.replace("'", "\\'")
                q = (
                    f"'{target_parent}' in parents and name = '{clean_escaped}' "
                    f"and mimeType = '{FOLDER_MIME_TYPE}' and trashed = false"
                )
                existing_res = (
                    self._service.files()
                    .list(
                        q=q,
                        fields=f"files({DEFAULT_FIELDS})",
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                    )
                    .execute()
                )
                existing_files = existing_res.get("files", [])
                if existing_files:
                    logger.info(f"Reusing existing folder '{clean_name}' ({existing_files[0]['id']})")
                    return self._format_drive_item(existing_files[0])

                body = {
                    "name": clean_name,
                    "mimeType": FOLDER_MIME_TYPE,
                    "parents": [target_parent],
                }
                res = (
                    self._service.files()
                    .create(
                        body=body,
                        fields=DEFAULT_FIELDS,
                        supportsAllDrives=True,
                    )
                    .execute()
                )
                self._record_change_event(res["id"], "file", False)
                return self._format_drive_item(res)
            except Exception as exc:
                logger.error(f"Failed to create folder {clean_name}: {exc}")
                if "notFound" in str(exc) or "File not found" in str(exc):
                    raise RuntimeError(
                        f"Google Drive folder '{target_parent}' not accessible. Please ensure you have shared this folder with '{self._service_account_email}' as Editor in Google Drive."
                    ) from exc
                raise RuntimeError(f"Google Drive API folder creation failed: {exc}") from exc

        # In-memory fallback (with deduplication)
        for f in self._in_memory_files.values():
            if (
                f.get("name") == clean_name
                and target_parent in f.get("parents", [])
                and f.get("mimeType") == FOLDER_MIME_TYPE
                and not f.get("trashed")
            ):
                return self._format_drive_item(f)

        fid = f"folder_{int(datetime.now(timezone.utc).timestamp()*1000)}"
        now = datetime.now(timezone.utc).isoformat()
        folder_dict = {
            "id": fid,
            "name": clean_name,
            "mimeType": FOLDER_MIME_TYPE,
            "parents": [target_parent],
            "size": 0,
            "createdTime": now,
            "modifiedTime": now,
            "version": "1",
            "trashed": False,
            "capabilities": {"canEdit": True},
        }
        self._in_memory_files[fid] = folder_dict
        self._record_change_event(fid, "file", False)
        return self._format_drive_item(folder_dict)

    def upload_file(
        self,
        content: bytes,
        filename: str,
        mime_type: Optional[str] = None,
        parent_id: Optional[str] = None,
        description: Optional[str] = None,
    ) -> DriveFileItem:
        """Upload file to Google Drive with automatic MIME detection and revision updating (no duplicates)."""
        target_parent = parent_id or self.get_workspace_root_id()
        detected_mime = mime_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"

        if self.is_configured():
            try:
                from googleapiclient.http import MediaIoBaseUpload

                media = MediaIoBaseUpload(
                    io.BytesIO(content),
                    mimetype=detected_mime,
                    resumable=True if len(content) > 5 * 1024 * 1024 else False,
                )

                # Deduplication check: if active file with exact same name exists in folder, update it
                clean_fn = filename.replace("'", "\\'")
                q = (
                    f"'{target_parent}' in parents and name = '{clean_fn}' "
                    f"and mimeType != '{FOLDER_MIME_TYPE}' and trashed = false"
                )
                existing_res = (
                    self._service.files()
                    .list(
                        q=q,
                        fields=f"files({DEFAULT_FIELDS})",
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                    )
                    .execute()
                )
                existing_files = existing_res.get("files", [])
                if existing_files:
                    # Pick the best target: prefer existing real file over 0-byte stub
                    target_file = existing_files[0]
                    for ef in existing_files:
                        if int(ef.get("size") or 0) > 0:
                            target_file = ef
                            break
                    existing_id = target_file["id"]
                    logger.info(f"Updating existing file '{filename}' ({existing_id}) instead of creating duplicate")
                    res = (
                        self._service.files()
                        .update(
                            fileId=existing_id,
                            media_body=media,
                            fields=DEFAULT_FIELDS,
                            supportsAllDrives=True,
                        )
                        .execute()
                    )
                    # Clean up any leftover duplicate ghosts in Drive
                    for ef in existing_files:
                        if ef["id"] != existing_id:
                            try:
                                self._service.files().update(fileId=ef["id"], body={"trashed": True}).execute()
                                logger.info(f"Cleaned up legacy ghost file '{filename}' ({ef['id']})")
                            except Exception:
                                pass
                    self._record_change_event(existing_id, "file", False)
                    return self._format_drive_item(res)

                body = {
                    "name": filename,
                    "parents": [target_parent],
                    "description": description or f"Uploaded via EDINNO Assessment Studio on {datetime.now(timezone.utc).isoformat()}",
                }
                res = (
                    self._service.files()
                    .create(
                        body=body,
                        media_body=media,
                        fields=DEFAULT_FIELDS,
                        supportsAllDrives=True,
                    )
                    .execute()
                )
                self._record_change_event(res["id"], "file", False)
                return self._format_drive_item(res)
            except Exception as exc:
                logger.error(f"Failed to upload file {filename}: {exc}")
                if "notFound" in str(exc) or "File not found" in str(exc):
                    raise RuntimeError(
                        f"Google Drive folder '{target_parent}' not accessible. Please ensure you have shared this folder with '{self._service_account_email}' as Editor in Google Drive."
                    ) from exc
                if "storageQuotaExceeded" in str(exc):
                    raise RuntimeError(
                        "Google Service Accounts have 0 GB storage quota in personal Drive folders. "
                        "Please click 'Authorize Google Account' on the Drive page to upload under your Google account, "
                        "or use a Google Workspace Shared Drive."
                    ) from exc
                raise RuntimeError(f"Google Drive API upload failed: {exc}") from exc

        # In-memory fallback (deduplicated: updates existing file content if same name in parent)
        import hashlib

        for fid, f in self._in_memory_files.items():
            if (
                f.get("name") == filename
                and target_parent in f.get("parents", [])
                and f.get("mimeType") != FOLDER_MIME_TYPE
                and not f.get("trashed")
            ):
                f["size"] = len(content)
                f["md5Checksum"] = hashlib.md5(content).hexdigest()
                f["modifiedTime"] = datetime.now(timezone.utc).isoformat()
                f["version"] = str(int(f.get("version", "1")) + 1)
                self._in_memory_binaries[fid] = content
                self._record_change_event(fid, "file", False)
                return self._format_drive_item(f)

        fid = f"file_{int(datetime.now(timezone.utc).timestamp()*1000)}"
        now = datetime.now(timezone.utc).isoformat()
        md5 = hashlib.md5(content).hexdigest()

        file_dict = {
            "id": fid,
            "name": filename,
            "mimeType": detected_mime,
            "parents": [target_parent],
            "size": len(content),
            "md5Checksum": md5,
            "createdTime": now,
            "modifiedTime": now,
            "version": "1",
            "trashed": False,
            "webViewLink": f"https://drive.google.com/file/d/{fid}/view",
            "webContentLink": f"https://drive.google.com/uc?id={fid}&export=download",
            "description": description,
            "capabilities": {"canEdit": True},
        }
        self._in_memory_files[fid] = file_dict
        self._in_memory_binaries[fid] = content
        self._record_change_event(fid, "file", False)
        return self._format_drive_item(file_dict)

    def get_file_metadata(self, file_id: str) -> DriveFileItem:
        """Fetch metadata for a single Drive file or folder."""
        if self.is_configured():
            try:
                res = (
                    self._service.files()
                    .get(
                        fileId=file_id,
                        fields=DEFAULT_FIELDS,
                        supportsAllDrives=True,
                    )
                    .execute()
                )
                return self._format_drive_item(res)
            except Exception as exc:
                if "notFound" in str(exc) or "File not found" in str(exc):
                    raise RuntimeError(
                        f"Google Drive item '{file_id}' not found or not accessible. "
                        f"Please ensure it is shared with '{self._service_account_email}' as Editor."
                    ) from exc
                raise RuntimeError(f"Drive file error on '{file_id}': {exc}") from exc

        item = self._in_memory_files.get(file_id)
        if not item:
            raise RuntimeError(f"Drive file not found: {file_id}")
        return self._format_drive_item(item)

    def get_file_stream(self, file_id: str) -> Tuple[io.BytesIO, str, str]:
        """Download file binary stream, returning (stream, filename, mime_type)."""
        meta = self.get_file_metadata(file_id)
        if meta.is_folder:
            raise ValueError(f"Cannot download folder {file_id} as a binary file.")

        if self.is_configured():
            try:
                from googleapiclient.http import MediaIoBaseDownload

                request = self._service.files().get_media(fileId=file_id, supportsAllDrives=True)
                stream = io.BytesIO()
                downloader = MediaIoBaseDownload(stream, request)
                done = False
                while not done:
                    _, done = downloader.next_chunk()
                stream.seek(0)
                return stream, meta.name, meta.mime_type
            except Exception as exc:
                logger.error(f"Failed to stream download file {file_id}: {exc}")
                raise RuntimeError(f"Failed to download Google Drive file: {exc}") from exc

        binary = self._in_memory_binaries.get(file_id, b"")
        return io.BytesIO(binary), meta.name, meta.mime_type

    def rename_file(self, file_id: str, new_name: str) -> DriveFileItem:
        """Rename file or folder."""
        if self.is_configured():
            try:
                body = {"name": new_name.strip()}
                res = (
                    self._service.files()
                    .update(
                        fileId=file_id,
                        body=body,
                        fields=DEFAULT_FIELDS,
                        supportsAllDrives=True,
                    )
                    .execute()
                )
                self._record_change_event(file_id, "file", False)
                return self._format_drive_item(res)
            except Exception as exc:
                logger.error(f"Failed to rename file {file_id}: {exc}")
                raise RuntimeError(f"Google Drive rename failed: {exc}") from exc

        item = self._in_memory_files.get(file_id)
        if not item:
            raise RuntimeError(f"Drive file not found: {file_id}")
        item["name"] = new_name.strip()
        item["modifiedTime"] = datetime.now(timezone.utc).isoformat()
        self._record_change_event(file_id, "file", False)
        return self._format_drive_item(item)

    def move_file(self, file_id: str, new_parent_id: str) -> DriveFileItem:
        """Move file to a different folder in Google Drive."""
        meta = self.get_file_metadata(file_id)
        old_parent = meta.parent_id or ""

        if self.is_configured():
            try:
                res = (
                    self._service.files()
                    .update(
                        fileId=file_id,
                        addParents=new_parent_id,
                        removeParents=old_parent,
                        fields=DEFAULT_FIELDS,
                        supportsAllDrives=True,
                    )
                    .execute()
                )
                self._record_change_event(file_id, "file", False)
                return self._format_drive_item(res)
            except Exception as exc:
                logger.error(f"Failed to move file {file_id}: {exc}")
                raise RuntimeError(f"Google Drive move failed: {exc}") from exc

        item = self._in_memory_files.get(file_id)
        if not item:
            raise RuntimeError(f"Drive file not found: {file_id}")
        item["parents"] = [new_parent_id]
        item["modifiedTime"] = datetime.now(timezone.utc).isoformat()
        self._record_change_event(file_id, "file", False)
        return self._format_drive_item(item)

    def trash_file(self, file_id: str) -> bool:
        """Move file or folder to Google Drive trash."""
        if self.is_configured():
            try:
                self._service.files().update(
                    fileId=file_id,
                    body={"trashed": True},
                    supportsAllDrives=True,
                ).execute()
                self._record_change_event(file_id, "file", True)
                return True
            except Exception as exc:
                logger.error(f"Failed to trash file {file_id}: {exc}")
                raise RuntimeError(f"Google Drive trash failed: {exc}") from exc

        item = self._in_memory_files.get(file_id)
        if not item:
            return False
        item["trashed"] = True
        self._record_change_event(file_id, "file", True)
        return True

    def delete_file_permanently(self, file_id: str) -> bool:
        """Permanently delete file from Google Drive."""
        if self.is_configured():
            try:
                self._service.files().delete(fileId=file_id, supportsAllDrives=True).execute()
                self._record_change_event(file_id, "file", True)
                return True
            except Exception as exc:
                logger.error(f"Failed to delete file {file_id}: {exc}")
                raise RuntimeError(f"Google Drive delete failed: {exc}") from exc

        self._in_memory_files.pop(file_id, None)
        self._in_memory_binaries.pop(file_id, None)
        self._record_change_event(file_id, "file", True)
        return True

    # ---------------------------------------------------------------------------
    # Permissions & Sharing (RBAC)
    # ---------------------------------------------------------------------------

    def create_permission(
        self,
        file_id: str,
        email: str,
        role: str = "reader",
        send_notification_email: bool = True,
    ) -> DrivePermissionItem:
        """Share file or folder with a collaborator email address."""
        if self.is_configured():
            try:
                body = {
                    "role": role,
                    "type": "user",
                    "emailAddress": email.strip(),
                }
                res = (
                    self._service.permissions()
                    .create(
                        fileId=file_id,
                        body=body,
                        sendNotificationEmail=send_notification_email,
                        fields="id, role, type, emailAddress, displayName, photoLink",
                        supportsAllDrives=True,
                    )
                    .execute()
                )
                return DrivePermissionItem(
                    id=res["id"],
                    role=res.get("role", role),
                    type=res.get("type", "user"),
                    email_address=res.get("emailAddress", email),
                    display_name=res.get("displayName"),
                    photo_link=res.get("photoLink"),
                )
            except Exception as exc:
                logger.error(f"Failed to grant Drive permission on {file_id} to {email}: {exc}")
                raise RuntimeError(f"Google Drive share failed: {exc}") from exc

        # In-memory fallback
        perm_id = f"perm_{int(datetime.now(timezone.utc).timestamp()*1000)}"
        perm = {
            "id": perm_id,
            "role": role,
            "type": "user",
            "email_address": email.strip(),
            "display_name": email.split("@")[0].title(),
        }
        self._in_memory_permissions.setdefault(file_id, []).append(perm)
        return DrivePermissionItem(**perm)

    def list_permissions(self, file_id: str) -> List[DrivePermissionItem]:
        """List active permissions and collaborators for a file or folder."""
        if self.is_configured():
            try:
                res = (
                    self._service.permissions()
                    .list(
                        fileId=file_id,
                        fields="permissions(id, role, type, emailAddress, displayName, photoLink)",
                        supportsAllDrives=True,
                    )
                    .execute()
                )
                return [
                    DrivePermissionItem(
                        id=p["id"],
                        role=p.get("role", "reader"),
                        type=p.get("type", "user"),
                        email_address=p.get("emailAddress"),
                        display_name=p.get("displayName"),
                        photo_link=p.get("photoLink"),
                    )
                    for p in res.get("permissions", [])
                ]
            except Exception as exc:
                logger.error(f"Failed to list Drive permissions on {file_id}: {exc}")
                return []

        items = self._in_memory_permissions.get(file_id, [])
        return [DrivePermissionItem(**p) for p in items]

    def delete_permission(self, file_id: str, permission_id: str) -> bool:
        """Revoke a collaborator's access."""
        if self.is_configured():
            try:
                self._service.permissions().delete(
                    fileId=file_id,
                    permissionId=permission_id,
                    supportsAllDrives=True,
                ).execute()
                return True
            except Exception as exc:
                logger.error(f"Failed to revoke Drive permission {permission_id}: {exc}")
                raise RuntimeError(f"Google Drive permission revocation failed: {exc}") from exc

        perms = self._in_memory_permissions.get(file_id, [])
        self._in_memory_permissions[file_id] = [p for p in perms if p.get("id") != permission_id]
        return True

    # ---------------------------------------------------------------------------
    # Bidirectional Synchronization & Change Tokens
    # ---------------------------------------------------------------------------

    def get_start_page_token(self) -> str:
        """Fetch initial synchronization cursor token."""
        if self.is_configured():
            try:
                res = self._service.changes().getStartPageToken(supportsAllDrives=True).execute()
                return res.get("startPageToken", "1")
            except Exception as exc:
                logger.error(f"Failed to fetch Drive start page token: {exc}")
                return "1"

        self._sync_token_counter += 1
        return str(self._sync_token_counter)

    def list_changes(self, start_page_token: str) -> DriveSyncResponse:
        """Fetch all incremental changes since token."""
        if self.is_configured():
            try:
                res = (
                    self._service.changes()
                    .list(
                        pageToken=start_page_token,
                        fields="newStartPageToken, nextPageToken, changes(changeType, fileId, removed, time, file("
                        + DEFAULT_FIELDS
                        + "))",
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                    )
                    .execute()
                )

                deltas = []
                for ch in res.get("changes", []):
                    f_item = self._format_drive_item(ch["file"]) if ch.get("file") else None
                    deltas.append(
                        DriveChangeDeltaItem(
                            change_type=ch.get("changeType", "file"),
                            file_id=ch.get("fileId", ""),
                            removed=ch.get("removed", False),
                            file=f_item,
                            time=ch.get("time"),
                        )
                    )

                return DriveSyncResponse(
                    changes=deltas,
                    new_start_page_token=res.get("newStartPageToken") or start_page_token,
                    has_more_changes=bool(res.get("nextPageToken")),
                )
            except Exception as exc:
                logger.error(f"Failed to query Drive changes: {exc}")
                # Auto-recover if token is invalid, stale, or expired:
                fresh_token = self.get_start_page_token()
                return DriveSyncResponse(changes=[], new_start_page_token=fresh_token)

        # In-memory changes
        deltas = []
        for ch in self._in_memory_changes:
            fid = ch.get("file_id")
            f_dict = self._in_memory_files.get(fid) if fid else None
            deltas.append(
                DriveChangeDeltaItem(
                    change_type=ch.get("change_type", "file"),
                    file_id=fid,
                    removed=ch.get("removed", False),
                    file=self._format_drive_item(f_dict) if f_dict else None,
                    time=ch.get("time"),
                )
            )

        self._sync_token_counter += 1
        return DriveSyncResponse(
            changes=deltas,
            new_start_page_token=str(self._sync_token_counter),
            has_more_changes=False,
        )

    def _record_change_event(self, file_id: str, change_type: str, removed: bool) -> None:
        """Register local event into change stream."""
        self._in_memory_changes.append({
            "file_id": file_id,
            "change_type": change_type,
            "removed": removed,
            "time": datetime.now(timezone.utc).isoformat(),
        })

    # ---------------------------------------------------------------------------
    # Storage Quota
    # ---------------------------------------------------------------------------

    def get_storage_quota(self) -> Dict[str, Any]:
        """Fetch Drive storage quota usage (cached for 30s to make status checks instantaneous)."""
        now = time.monotonic()
        if self._cached_quota and (now - self._cached_quota_time < 30.0):
            return self._cached_quota

        if self.is_configured():
            try:
                about = self._service.about().get(fields="storageQuota, user").execute()
                quota = about.get("storageQuota", {})
                usage = int(quota.get("usage", 0))
                limit = int(quota.get("limit", 0)) if quota.get("limit") else None
                res = {
                    "quota_bytes_used": usage,
                    "quota_bytes_total": limit,
                    "quota_readable": f"{round(usage / (1024**3), 2)} GB used"
                    + (f" of {round(limit / (1024**3), 2)} GB" if limit else " (Unlimited Pro)"),
                }
                self._cached_quota = res
                self._cached_quota_time = now
                return res
            except Exception as exc:
                logger.warning(f"Could not retrieve storage quota: {exc}")

        # Default placeholder quota
        used = sum(len(b) for b in self._in_memory_binaries.values())
        return {
            "quota_bytes_used": used,
            "quota_bytes_total": 15 * 1024 * 1024 * 1024,
            "quota_readable": f"{round(used / (1024**2), 2)} MB of 15 GB Workspace",
        }

    # ---------------------------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------------------------

    def _format_drive_item(self, f: Optional[Dict[str, Any]]) -> DriveFileItem:
        if not f:
            return DriveFileItem(id="unknown", name="Unknown", mime_type="application/octet-stream")

        mime = f.get("mimeType", "")
        parents = f.get("parents", [])
        parent_id = parents[0] if parents else None

        return DriveFileItem(
            id=f.get("id", ""),
            name=f.get("name", "Untitled"),
            mime_type=mime,
            size_bytes=int(f.get("size", 0)) if f.get("size") else 0,
            is_folder=mime == FOLDER_MIME_TYPE,
            parent_id=parent_id,
            web_view_link=f.get("webViewLink") or f"https://drive.google.com/file/d/{f.get('id')}/view",
            web_content_link=f.get("webContentLink") or f"https://drive.google.com/uc?id={f.get('id')}&export=download",
            thumbnail_link=f.get("thumbnailLink"),
            icon_link=f.get("iconLink"),
            created_time=f.get("createdTime"),
            modified_time=f.get("modifiedTime"),
            version=str(f.get("version", "1")),
            md5_checksum=f.get("md5Checksum"),
            owners=f.get("owners", []),
            shared=bool(f.get("shared", False)),
            can_edit=bool(f.get("capabilities", {}).get("canEdit", True)),
            description=f.get("description"),
        )

    def _get_folder_breadcrumbs(self, current_folder_id: Optional[str]) -> List[BreadcrumbItem]:
        """Traverse folder tree upward to construct navigation breadcrumb trail."""
        crumbs: List[BreadcrumbItem] = []
        visited = set()
        curr_id = current_folder_id

        root_id = self._workspace_root_id

        while curr_id and curr_id not in visited and curr_id != "root":
            visited.add(curr_id)
            if self.is_configured():
                try:
                    f = self._service.files().get(fileId=curr_id, fields="id, name, parents").execute()
                    crumbs.insert(0, BreadcrumbItem(id=f["id"], name=f["name"]))
                    parents = f.get("parents", [])
                    curr_id = parents[0] if parents else None
                    if f["id"] == root_id:
                        break
                except Exception:
                    break
            else:
                f_mem = self._in_memory_files.get(curr_id)
                if not f_mem:
                    break
                crumbs.insert(0, BreadcrumbItem(id=f_mem["id"], name=f_mem["name"]))
                parents = f_mem.get("parents", [])
                curr_id = parents[0] if parents else None
                if f_mem["id"] == root_id:
                    break

        if not crumbs or (root_id and crumbs[0].id != root_id):
            crumbs.insert(0, BreadcrumbItem(id=root_id or "root", name="EDINNO Workspace"))

        return crumbs


# Global singleton instance
google_drive_service = GoogleDriveService()
