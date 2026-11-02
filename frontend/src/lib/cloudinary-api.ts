/**
 * cloudinary-api.ts - Client API for Cloudinary PDF storage & curriculum management.
 * Connects UI to backend /api/v1/storage endpoints.
 */

import {
  CloudinaryAsset,
  CloudinaryAssetListResponse,
  CloudinaryConfigStatus,
  CloudinaryUploadResponse,
} from "../types";
import { extractErrorMessage } from "./api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function getCloudinaryConfigStatus(): Promise<CloudinaryConfigStatus> {
  const res = await fetch(`${API_BASE}/api/v1/storage/config-status`);
  if (!res.ok) {
    throw new Error("Failed to check Cloudinary storage status");
  }
  return await res.json();
}

export interface UploadCloudinaryPdfParams {
  file: File;
  grade: number;
  chapter: string;
  category: string;
  title?: string;
  overwrite?: boolean;
}

export async function uploadCloudinaryPdf({
  file,
  grade,
  chapter,
  category,
  title,
  overwrite = true,
}: UploadCloudinaryPdfParams): Promise<CloudinaryUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("grade", String(grade));
  formData.append("chapter", chapter);
  formData.append("category", category);
  if (title) formData.append("title", title);
  formData.append("overwrite", String(overwrite));

  const res = await fetch(`${API_BASE}/api/v1/storage/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(extractErrorMessage(err, "Failed to upload PDF to Cloudinary"));
  }

  return await res.json();
}

export interface FetchCloudinaryAssetsParams {
  grade?: number;
  category?: string;
  chapter?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchCloudinaryAssets({
  grade,
  category,
  chapter,
  search,
  page = 1,
  pageSize = 50,
}: FetchCloudinaryAssetsParams = {}): Promise<CloudinaryAssetListResponse> {
  const params = new URLSearchParams();
  if (grade !== undefined && grade !== null) params.set("grade", String(grade));
  if (category && category.toLowerCase() !== "all") params.set("category", category);
  if (chapter) params.set("chapter", chapter);
  if (search) params.set("search", search);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  const res = await fetch(`${API_BASE}/api/v1/storage/assets?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch assets" }));
    throw new Error(extractErrorMessage(err, "Failed to load curriculum PDF assets"));
  }

  return await res.json();
}

export async function fetchCloudinaryAsset(assetId: string): Promise<CloudinaryAsset> {
  const res = await fetch(`${API_BASE}/api/v1/storage/assets/${encodeURIComponent(assetId)}`);
  if (!res.ok) {
    throw new Error(`Curriculum PDF asset '${assetId}' not found.`);
  }
  return await res.json();
}

export async function replaceCloudinaryPdf(
  assetId: string,
  file: File
): Promise<CloudinaryUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/v1/storage/assets/${encodeURIComponent(assetId)}/replace`, {
    method: "PUT",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Replacement failed" }));
    throw new Error(extractErrorMessage(err, "Failed to replace PDF document"));
  }

  return await res.json();
}

export async function deleteCloudinaryPdf(
  assetId: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/v1/storage/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Delete failed" }));
    throw new Error(extractErrorMessage(err, "Failed to delete PDF asset"));
  }

  return await res.json();
}

