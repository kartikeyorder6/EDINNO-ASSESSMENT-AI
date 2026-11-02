/**
 * drive-api.ts - Typed API client for Google Drive Centralized Workspace.
 */

export function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    // When running in browser, always bind localhost/127.0.0.1 to IPv4 127.0.0.1:8000
    // to prevent IPv6 [::1]:8000 ECONNREFUSED ("Failed to fetch") on macOS
    const hostname = window.location.hostname;
    if (hostname === "127.0.0.1" || hostname === "localhost") return "http://127.0.0.1:8000";
    if (hostname) return `http://${hostname}:8000`;
  }
  return "http://127.0.0.1:8000";
}

export interface DriveFileItem {
  id: string;
  name: string;
  mime_type: string;
  size_bytes?: number;
  is_folder: boolean;
  parent_id?: string | null;
  web_view_link?: string | null;
  web_content_link?: string | null;
  thumbnail_link?: string | null;
  icon_link?: string | null;
  created_time?: string | null;
  modified_time?: string | null;
  version?: string | null;
  md5_checksum?: string | null;
  owners?: Array<{ displayName?: string; emailAddress?: string; photoLink?: string }>;
  shared?: boolean;
  can_edit?: boolean;
  description?: string | null;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface DriveFileListResponse {
  files: DriveFileItem[];
  next_page_token?: string | null;
  current_folder_id?: string | null;
  current_folder_name?: string | null;
  breadcrumbs: BreadcrumbItem[];
  total_count: number;
}

export interface DrivePermissionItem {
  id: string;
  role: string;
  type: string;
  email_address?: string | null;
  display_name?: string | null;
  photo_link?: string | null;
}

export interface DriveSyncStatusResponse {
  is_configured: boolean;
  is_oauth_connected?: boolean;
  auth_type?: "service_account" | "oauth";
  service_account_email?: string | null;
  root_folder_id?: string | null;
  root_folder_name?: string | null;
  quota_bytes_used?: number | null;
  quota_bytes_total?: number | null;
  quota_readable?: string | null;
  last_reconciled_at?: string | null;
}

export interface DriveChangeDeltaItem {
  change_type: string;
  file_id: string;
  removed: boolean;
  file?: DriveFileItem | null;
  time?: string | null;
}

export interface DriveSyncResponse {
  changes: DriveChangeDeltaItem[];
  new_start_page_token: string;
  has_more_changes: boolean;
}

export async function fetchDriveStatus(): Promise<DriveSyncStatusResponse> {
  const res = await fetch(`${getApiBase()}/api/v1/drive/status`);
  if (!res.ok) {
    throw new Error(`Failed to fetch Drive status (${res.status})`);
  }
  return res.json();
}

export async function fetchDriveFiles(params?: {
  folder_id?: string;
  search?: string;
  mime_type?: string;
  page_size?: number;
  page_token?: string;
}): Promise<DriveFileListResponse> {
  const query = new URLSearchParams();
  if (params?.folder_id) query.set("folder_id", params.folder_id);
  if (params?.search) query.set("search", params.search);
  if (params?.mime_type) query.set("mime_type", params.mime_type);
  if (params?.page_size) query.set("page_size", String(params.page_size));
  if (params?.page_token) query.set("page_token", params.page_token);

  const res = await fetch(`${getApiBase()}/api/v1/drive/files?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to list Google Drive files.");
  }
  return res.json();
}

export async function createDriveFolder(name: string, parentId?: string): Promise<DriveFileItem> {
  const res = await fetch(`${getApiBase()}/api/v1/drive/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parent_id: parentId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create folder in Google Drive.");
  }
  return res.json();
}

export async function uploadDriveFile(
  file: File,
  parentId?: string,
  description?: string
): Promise<DriveFileItem> {
  const formData = new FormData();
  formData.append("file", file);
  if (parentId) formData.append("parent_id", parentId);
  if (description) formData.append("description", description);

  const res = await fetch(`${getApiBase()}/api/v1/drive/files/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to upload file to Google Drive.");
  }
  return res.json();
}

export async function renameDriveFile(fileId: string, name: string): Promise<DriveFileItem> {
  const res = await fetch(`${getApiBase()}/api/v1/drive/files/${fileId}/rename`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to rename file in Google Drive.");
  }
  return res.json();
}

export async function moveDriveFile(fileId: string, destinationFolderId: string): Promise<DriveFileItem> {
  const res = await fetch(`${getApiBase()}/api/v1/drive/files/${fileId}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination_folder_id: destinationFolderId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to move file in Google Drive.");
  }
  return res.json();
}

export async function trashDriveFile(fileId: string, permanent: boolean = false): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/v1/drive/files/${fileId}?permanent=${permanent}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete file from Google Drive.");
  }
}

export function getDriveDownloadUrl(fileId: string): string {
  return `${getApiBase()}/api/v1/drive/files/${fileId}/download`;
}

export async function fetchDrivePermissions(fileId: string): Promise<DrivePermissionItem[]> {
  const res = await fetch(`${getApiBase()}/api/v1/drive/files/${fileId}/permissions`);
  if (!res.ok) {
    return [];
  }
  return res.json();
}

export async function shareDriveFile(
  fileId: string,
  email: string,
  role: "reader" | "commenter" | "writer" = "reader"
): Promise<DrivePermissionItem> {
  const res = await fetch(`${getApiBase()}/api/v1/drive/files/${fileId}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role, send_notification_email: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to share Google Drive item.");
  }
  return res.json();
}

export async function revokeDrivePermission(fileId: string, permissionId: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/v1/drive/files/${fileId}/permissions/${permissionId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to revoke collaborator permission.");
  }
}

export async function syncDriveChanges(pageToken?: string): Promise<DriveSyncResponse> {
  const query = pageToken ? `?page_token=${encodeURIComponent(pageToken)}` : "";
  const res = await fetch(`${getApiBase()}/api/v1/drive/sync/changes${query}`);
  if (!res.ok) {
    throw new Error("Failed to synchronize Google Drive changes.");
  }
  return res.json();
}

export function getDriveLoginUrl(): string {
  return `${getApiBase()}/api/v1/drive/auth/login`;
}

export async function disconnectDrive(): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/v1/drive/auth/disconnect`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("Failed to disconnect Google Drive.");
  }
}


