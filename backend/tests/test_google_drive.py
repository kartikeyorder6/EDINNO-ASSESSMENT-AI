"""
test_google_drive.py - Integration and functional tests for Google Drive Centralized Workspace.
"""

from __future__ import annotations

import io
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_drive_workspace_status():
    """Verify drive status returns health and storage metrics."""
    resp = client.get("/api/v1/drive/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "is_configured" in data
    assert "root_folder_id" in data
    assert "quota_readable" in data


def test_drive_folder_creation_and_listing():
    """Create a folder and list contents."""
    # 1. Create a folder
    create_resp = client.post(
        "/api/v1/drive/folders",
        json={"name": "Grade 7 Robotics Docs"},
    )
    assert create_resp.status_code == 200
    folder = create_resp.json()
    assert folder["name"] == "Grade 7 Robotics Docs"
    assert folder["is_folder"] is True
    folder_id = folder["id"]

    # 2. List files in root
    list_resp = client.get("/api/v1/drive/files")
    assert list_resp.status_code == 200
    files_data = list_resp.json()
    assert any(f["id"] == folder_id for f in files_data["files"])


def test_drive_file_upload_download_and_metadata():
    """Upload a file, check metadata, and download the exact bytes."""
    # 1. Upload a text/PDF file
    test_content = b"PDF dummy payload for testing Google Drive upload & download."
    upload_resp = client.post(
        "/api/v1/drive/files/upload",
        files={"file": ("curriculum_guide.pdf", io.BytesIO(test_content), "application/pdf")},
        data={"description": "Test curriculum guide upload"},
    )
    assert upload_resp.status_code == 200
    uploaded = upload_resp.json()
    assert uploaded["name"] == "curriculum_guide.pdf"
    assert uploaded["size_bytes"] == len(test_content)
    file_id = uploaded["id"]

    # 2. Get metadata
    meta_resp = client.get(f"/api/v1/drive/files/{file_id}")
    assert meta_resp.status_code == 200
    meta = meta_resp.json()
    assert meta["id"] == file_id
    assert meta["md5_checksum"] is not None

    # 3. Stream download
    download_resp = client.get(f"/api/v1/drive/files/{file_id}/download")
    assert download_resp.status_code == 200
    assert download_resp.content == test_content
    assert "Content-Disposition" in download_resp.headers


def test_drive_file_rename_and_move():
    """Rename a file and move it between folders."""
    # 1. Create target folder and file
    folder_resp = client.post("/api/v1/drive/folders", json={"name": "Target Archive"})
    assert folder_resp.status_code == 200
    folder_id = folder_resp.json()["id"]

    upload_resp = client.post(
        "/api/v1/drive/files/upload",
        files={"file": ("draft_v1.txt", io.BytesIO(b"draft content"), "text/plain")},
    )
    file_id = upload_resp.json()["id"]

    # 2. Rename file
    rename_resp = client.patch(f"/api/v1/drive/files/{file_id}/rename", json={"name": "final_v2.txt"})
    assert rename_resp.status_code == 200
    assert rename_resp.json()["name"] == "final_v2.txt"

    # 3. Move file
    move_resp = client.patch(f"/api/v1/drive/files/{file_id}/move", json={"destination_folder_id": folder_id})
    assert move_resp.status_code == 200
    assert move_resp.json()["parent_id"] == folder_id


def test_drive_permissions_sharing_and_revocation():
    """Test collaborative sharing with email and revoking permissions."""
    # 1. Upload a file to share
    upload_resp = client.post(
        "/api/v1/drive/files/upload",
        files={"file": ("shared_spec.pdf", io.BytesIO(b"shared bytes"), "application/pdf")},
    )
    file_id = upload_resp.json()["id"]

    # 2. Share with collaborator
    share_resp = client.post(
        f"/api/v1/drive/files/{file_id}/permissions",
        json={"email": "teacher@stemlab.org", "role": "writer", "send_notification_email": False},
    )
    assert share_resp.status_code == 200
    perm = share_resp.json()
    assert perm["email_address"] == "teacher@stemlab.org"
    assert perm["role"] == "writer"
    perm_id = perm["id"]

    # 3. List permissions
    list_perms_resp = client.get(f"/api/v1/drive/files/{file_id}/permissions")
    assert list_perms_resp.status_code == 200
    perms = list_perms_resp.json()
    assert any(p["id"] == perm_id for p in perms)

    # 4. Revoke permission
    revoke_resp = client.delete(f"/api/v1/drive/files/{file_id}/permissions/{perm_id}")
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["success"] is True


def test_drive_bidirectional_sync_changes():
    """Verify change token query tracks file additions and deletions."""
    # 1. Get current start token
    initial_resp = client.get("/api/v1/drive/sync/changes")
    assert initial_resp.status_code == 200
    initial_token = initial_resp.json()["new_start_page_token"]

    # 2. Perform an action that produces changes
    upload_resp = client.post(
        "/api/v1/drive/files/upload",
        files={"file": ("sync_test.pdf", io.BytesIO(b"sync content"), "application/pdf")},
    )
    file_id = upload_resp.json()["id"]

    # 3. Fetch changes since initial token
    changes_resp = client.get(f"/api/v1/drive/sync/changes?page_token={initial_token}")
    assert changes_resp.status_code == 200
    changes_data = changes_resp.json()
    assert len(changes_data["changes"]) > 0
    assert any(c["file_id"] == file_id for c in changes_data["changes"])


def test_drive_trash_and_delete():
    """Trash a file and permanently delete it."""
    upload_resp = client.post(
        "/api/v1/drive/files/upload",
        files={"file": ("to_delete.txt", io.BytesIO(b"trash me"), "text/plain")},
    )
    file_id = upload_resp.json()["id"]

    # 1. Trash
    trash_resp = client.delete(f"/api/v1/drive/files/{file_id}")
    assert trash_resp.status_code == 200
    assert trash_resp.json()["success"] is True

    # 2. Permanent delete
    delete_resp = client.delete(f"/api/v1/drive/files/{file_id}?permanent=true")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["success"] is True


def test_drive_oauth_authorization_endpoints():
    """Verify OAuth login URL generation and disconnect lifecycle."""
    # 1. Login authorization URL endpoint
    login_resp = client.get("/api/v1/drive/auth/login?json_mode=true")
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert "authorization_url" in data
    assert "accounts.google.com" in data["authorization_url"]
    assert "client_id=" in data["authorization_url"]

    # 2. Disconnect endpoint
    dc_resp = client.post("/api/v1/drive/auth/disconnect")
    assert dc_resp.status_code == 200
    assert dc_resp.json()["status"] == "disconnected"

