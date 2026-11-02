/**
 * curriculum-api.ts - Typed API client for the Centralized Curriculum Workspace.
 * Enforces the strict 6-field curriculum contract: count, video_id, grade, chapter, category, status.
 */

export type CurriculumStatus = "Not Started" | "In Progress" | "Done" | "On Hold";

export const ALLOWED_STATUSES: CurriculumStatus[] = [
  "Not Started",
  "In Progress",
  "Done",
  "On Hold",
];

export const CURRICULUM_STATUSES = ALLOWED_STATUSES;

export const CURRICULUM_CATEGORIES = ["Topic", "Activity", "Project"] as const;
export type CurriculumCategory = (typeof CURRICULUM_CATEGORIES)[number];

export const CURRICULUM_CATEGORY_OPTIONS = [
  { value: "Topic", label: "Topic" },
  { value: "Activity", label: "Activity" },
  { value: "Project", label: "Project" },
] as const;

/**
 * Extract the integer chapter number from a chapter string.
 * e.g. "Chapter 3: Electric Current" -> 3
 * e.g. "Ch 4" -> 4
 * e.g. "12" -> 12
 * If no digits are found, attempts to locate the chapter's position among known chapters for that grade,
 * defaulting to 1 if unknown.
 */
export function extractChapterNumber(
  chapter: string,
  existingChapters?: string[]
): number {
  if (!chapter) return 1;
  const match = chapter.match(/\d+/);
  if (match) return parseInt(match[0], 10);

  if (existingChapters && existingChapters.length > 0) {
    const idx = existingChapters.indexOf(chapter);
    if (idx !== -1) return idx + 1;
  }
  return 1;
}

/**
 * Natural numeric sorter for chapter titles:
 * Chapter 1, Chapter 2, ... Chapter 9, Chapter 10, Chapter 11, Chapter 12.
 */
export function sortChaptersNumerically(a: string, b: string): number {
  const numA = extractChapterNumber(a);
  const numB = extractChapterNumber(b);
  if (numA !== numB) return numA - numB;
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Maps a curriculum category to its single-character uppercase code:
 * "Topic" -> "T", "Activity" -> "A", "Project" -> "P".
 */
export function getCategoryCode(category: string): string {
  const cat = (category || "").trim().toUpperCase();
  if (cat.startsWith("ACT")) return "A";
  if (cat.startsWith("PROJ")) return "P";
  return "T";
}

/**
 * Generate a standardized curriculum Video ID following the nomenclature:
 * Grade number -> Chapter number -> Category number/code with zero-padded sequence.
 * Format: G[Grade]-C[Chapter]-[CategoryCode][Sequence]
 * e.g., Grade 6, Chapter 1, Topic 1 -> "G6-C1-T01"
 * e.g., Grade 6, Chapter 1, Activity 2 -> "G6-C1-A02"
 * e.g., Grade 7, Chapter 3, Project 1 -> "G7-C3-P01"
 * 
 * Automatically scans existing records to ensure zero ID collisions.
 */
export function generateCurriculumVideoId(
  grade: number,
  chapter: string,
  category: string,
  existingRecords: Array<{ grade: number; chapter?: string; category?: string; video_id?: string }> = []
): string {
  const gNum = grade || 6;
  const knownChapters = Array.from(
    new Set(
      existingRecords
        .filter((r) => r.grade === gNum && r.chapter)
        .map((r) => r.chapter as string)
    )
  );
  const chNum = extractChapterNumber(chapter, knownChapters);
  const catCode = getCategoryCode(category);
  const prefix = `G${gNum}-C${chNum}-${catCode}`;

  // Find all existing sequence numbers matching this prefix
  const foundSeqs: number[] = [];
  const existingIdSet = new Set<string>();

  for (const r of existingRecords) {
    if (r.video_id) {
      existingIdSet.add(r.video_id.toUpperCase());
      const regex = new RegExp(`^G${gNum}-C${chNum}-${catCode}(\\d+)`, "i");
      const match = r.video_id.match(regex);
      if (match) {
        foundSeqs.push(parseInt(match[1], 10));
      }
    }
  }

  // Also count existing records with same grade, chapter number, and category if no regex matches
  if (foundSeqs.length === 0) {
    const matchingRecords = existingRecords.filter((r) => {
      if (r.grade !== gNum) return false;
      const rChNum = extractChapterNumber(r.chapter || "");
      if (rChNum !== chNum) return false;
      return getCategoryCode(r.category || "") === catCode;
    });
    if (matchingRecords.length > 0) {
      foundSeqs.push(matchingRecords.length);
    }
  }

  let nextSeq = foundSeqs.length > 0 ? Math.max(...foundSeqs) + 1 : 1;
  let candidate = `${prefix}${String(nextSeq).padStart(2, "0")}`;

  // Safety loop: increment if candidate ID already exists
  while (existingIdSet.has(candidate.toUpperCase())) {
    nextSeq += 1;
    candidate = `${prefix}${String(nextSeq).padStart(2, "0")}`;
  }

  return candidate;
}

export interface ParsedCurriculumFile {
  originalFilename: string;
  grade: number;
  chapter: string;
  chapterNumber: number;
  category: "Topic" | "Activity" | "Project";
  categoryCode: "T" | "A" | "P";
  sequence: number;
  meaningfulTitle: string;
  documentTitle: string;
  nomenclatureId: string;
}

/**
 * Intelligently parse curriculum filenames like:
 * - "6_Activity 2 (Control LED with Switch).pdf"
 * - "1_Activity 1 (Traffic Light Controller).pdf"
 * - "3_Topic 3 (Introduction to OLED Display ).pdf"
 * - "1_P-4 DefenceTech (Defence Protection System).pdf"
 * - "G6-C1-A02_Control_LED_with_Switch.pdf"
 *
 * Extracts:
 * - Grade (e.g. 6)
 * - Category ("Topic", "Activity", "Project")
 * - Sequence number (e.g. 2)
 * - Meaningful concept title (e.g. "Control LED with Switch")
 * - Clean document title (e.g. "Activity 2: Control LED with Switch")
 * - Standardized nomenclature ID (e.g. "G6-C1-A02")
 * - Relevant chapter association
 */
export function parseCurriculumFilename(
  filename: string,
  context?: {
    currentGrade?: number;
    availableChapters?: string[];
    currentChapter?: string;
  }
): ParsedCurriculumFile {
  const rawBase = filename.replace(/\.pdf$/i, "").trim();
  // Normalize underscores and hyphens to spaces for reliable word-boundary matching
  const normalized = rawBase.replace(/[_\-]+/g, " ").trim();

  // 1. Extract Grade (e.g. "6_", "Grade 6", "G6")
  let grade =
    context?.currentGrade && context.currentGrade >= 6 && context.currentGrade <= 12
      ? context.currentGrade
      : 6;

  const gradeMatch =
    normalized.match(/\b(?:Grade|G)\s*(\d{1,2})\b/i) || rawBase.match(/^(\d{1,2})[_\-\s]/);
  if (gradeMatch) {
    const parsedG = parseInt(gradeMatch[1], 10);
    if (parsedG >= 6 && parsedG <= 12) {
      grade = parsedG;
    }
  }

  // 2. Extract Category
  let category: "Topic" | "Activity" | "Project" = "Topic";
  let categoryCode: "T" | "A" | "P" = "T";

  if (/\b(?:activity|act|lab)\b/i.test(normalized)) {
    category = "Activity";
    categoryCode = "A";
  } else if (/\b(?:project|proj)\b/i.test(normalized) || /\bP\s*\d+/i.test(normalized)) {
    category = "Project";
    categoryCode = "P";
  } else if (/\b(?:topic|top|lesson|theory)\b/i.test(normalized)) {
    category = "Topic";
    categoryCode = "T";
  }

  // 3. Extract Sequence / Item Number
  let sequence = 1;
  const seqMatch =
    normalized.match(/(?:Activity|Act|Topic|Top|Project|Proj|P)\s*[\-:]?\s*(\d+)/i) ||
    rawBase.match(/^(\d+)[_\-\s]/);
  if (seqMatch) {
    sequence = parseInt(seqMatch[1], 10) || 1;
  }

  // 4. Extract Meaningful Title (inside parentheses or brackets, or after prefix)
  let meaningfulTitle = "";
  const bracketMatch = rawBase.match(/[\(\[](.*?)[\)\]]/);
  if (bracketMatch && bracketMatch[1].trim().length >= 2) {
    meaningfulTitle = bracketMatch[1].trim();
  } else {
    // Strip leading index, grade, and category prefix
    const stripped = rawBase
      .replace(/^[\d._\-]+\s*/, "")
      .replace(/^(?:Grade\s*\d+|G\d+)[_\-\s]*/i, "")
      .replace(/^(?:Activity|Topic|Project|P)\s*[\-:]?\s*\d+\s*[\-:]?\s*/i, "")
      .replace(/^[_\-\s]+|[_\-\s]+$/g, "")
      .replace(/[_-]/g, " ")
      .trim();
    meaningfulTitle = stripped || rawBase;
  }

  meaningfulTitle = meaningfulTitle.replace(/\s+/g, " ").trim();

  // 5. Construct Clean Document Title (e.g. "Activity 2: Control LED with Switch")
  let documentTitle = "";
  if (category === "Activity") {
    documentTitle = meaningfulTitle
      ? `Activity ${sequence}: ${meaningfulTitle}`
      : `Activity ${sequence}`;
  } else if (category === "Topic") {
    documentTitle = meaningfulTitle
      ? `Topic ${sequence}: ${meaningfulTitle}`
      : `Topic ${sequence}`;
  } else if (category === "Project") {
    documentTitle = meaningfulTitle
      ? `Project ${sequence}: ${meaningfulTitle}`
      : `Project ${sequence}`;
  } else {
    documentTitle = meaningfulTitle || rawBase;
  }

  // 6. Chapter Extraction & Association
  let chapter = context?.currentChapter || "";
  let chapterNumber = 1;

  const chMatch = normalized.match(/\b(?:Chapter|Ch|C)\s*[\-:]?\s*(\d+)\b/i);
  if (chMatch) {
    chapterNumber = parseInt(chMatch[1], 10) || 1;
    chapter = `Chapter ${chapterNumber}`;
  } else if (context?.availableChapters && context.availableChapters.length > 0) {
    const matchedCh =
      context.availableChapters.find((ch) => {
        const num = ch.match(/\d+/);
        return num && normalized.includes(num[0]);
      }) || context.availableChapters[0];
    chapter = matchedCh;
    const num = chapter.match(/\d+/);
    if (num) chapterNumber = parseInt(num[0], 10);
  } else if (!chapter || chapter.includes("Curriculum Chapter")) {
    chapter = `Chapter 1`;
  }

  // 7. Standard Nomenclature ID: G[Grade]-C[Chapter]-[CategoryCode][Sequence]
  const seqPadded = String(sequence).padStart(2, "0");
  const nomenclatureId = `G${grade}-C${chapterNumber}-${categoryCode}${seqPadded}`;

  return {
    originalFilename: filename,
    grade,
    chapter,
    chapterNumber,
    category,
    categoryCode,
    sequence,
    meaningfulTitle,
    documentTitle,
    nomenclatureId,
  };
}

export interface CurriculumRecord {
  count: number;
  video_id: string;
  grade: number;
  chapter: string;
  category: string;
  status: CurriculumStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CurriculumRecordInput {
  count: number;
  video_id: string;
  grade: number;
  chapter: string;
  category: string;
  status: CurriculumStatus;
}

export type CurriculumRecordCreate = CurriculumRecordInput;

export interface CurriculumRecordUpdateInput {
  count?: number;
  grade?: number;
  chapter?: string;
  category?: string;
  status?: CurriculumStatus;
  expected_version?: number;
}

export type CurriculumRecordUpdate = CurriculumRecordUpdateInput;

export interface CurriculumListResponse {
  records: CurriculumRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CurriculumHierarchyNode {
  id: string;
  name: string;
  node_type: "root" | "grade" | "chapter" | "category" | "record";
  count: number;
  status: CurriculumStatus | null;
  status_counts: Record<string, number>;
  record: CurriculumRecord | null;
  children: CurriculumHierarchyNode[];
}

export interface CurriculumHierarchyResponse {
  root: CurriculumHierarchyNode;
  total_records: number;
}

export interface CurriculumSummaryResponse {
  total_records: number;
  by_status: Record<string, number>;
  by_grade: Record<string, number>;
  by_category: Record<string, number>;
}

export type CurriculumSummary = CurriculumSummaryResponse;

export interface CurriculumImportRowValidation {
  row_number: number;
  is_valid: boolean;
  record: CurriculumRecordInput | null;
  errors: string[];
  ignored_obsolete_fields: string[];
}

export interface CurriculumImportPreviewResponse {
  total_rows: number;
  valid_count: number;
  error_count: number;
  previews: CurriculumImportRowValidation[];
}

export interface CurriculumImportCommitResponse {
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  errors: string[];
}

export function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "127.0.0.1" || hostname === "localhost") return "http://127.0.0.1:8000";
    if (hostname) return `http://${hostname}:8000`;
  }
  return "http://127.0.0.1:8000";
}

// ---------------------------------------------------------------------------
// REST Methods
// ---------------------------------------------------------------------------

export async function fetchCurriculumRecords(params?: {
  grade?: number;
  chapter?: string;
  category?: string;
  status?: CurriculumStatus;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}): Promise<CurriculumListResponse> {
  const query = new URLSearchParams();
  if (params?.grade) query.set("grade", String(params.grade));
  if (params?.chapter) query.set("chapter", params.chapter);
  if (params?.category) query.set("category", params.category);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.sort_by) query.set("sort_by", params.sort_by);
  if (params?.sort_order) query.set("sort_order", params.sort_order);
  if (params?.page) query.set("page", String(params.page));
  if (params?.page_size) query.set("page_size", String(params.page_size));

  const res = await fetch(`${getApiBase()}/api/v1/curriculum/records?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch curriculum records (${res.status})`);
  }
  return res.json();
}

export async function fetchCurriculumRecord(videoId: string): Promise<CurriculumRecord> {
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/records/${encodeURIComponent(videoId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Curriculum record '${videoId}' not found.`);
  }
  return res.json();
}

export async function createCurriculumRecord(payload: CurriculumRecordInput): Promise<CurriculumRecord> {
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create curriculum record.");
  }
  return res.json();
}

export async function updateCurriculumRecord(
  videoId: string,
  payload: CurriculumRecordUpdateInput
): Promise<CurriculumRecord> {
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/records/${encodeURIComponent(videoId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 409) {
      throw new Error(err.detail?.message || "Conflict: Record was modified by another session.");
    }
    throw new Error(err.detail || "Failed to update curriculum record.");
  }
  return res.json();
}

export async function deleteCurriculumRecord(videoId: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/records/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete curriculum record.");
  }
}

export async function bulkUpdateCurriculumStatus(
  videoIds: string[],
  status: CurriculumStatus
): Promise<number> {
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/records/bulk-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds, status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to bulk update status.");
  }
  const data = await res.json();
  return data.updated_count;
}

export async function bulkDeleteCurriculumRecords(videoIds: string[]): Promise<number> {
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/records/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_ids: videoIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to bulk delete records.");
  }
  const data = await res.json();
  return data.deleted_count;
}

export async function previewCurriculumCSVImport(file: File): Promise<CurriculumImportPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${getApiBase()}/api/v1/curriculum/records/import/preview`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to validate CSV file.");
  }
  return res.json();
}

export async function commitCurriculumCSVImport(
  records: CurriculumRecordInput[],
  mode: "upsert" | "skip" = "upsert"
): Promise<CurriculumImportCommitResponse> {
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/records/import/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records, mode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to commit import.");
  }
  return res.json();
}

export async function syncCurriculumSkeleton(): Promise<{
  success: boolean;
  imported_records: number;
  total_chapters: number;
  message: string;
}> {
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/sync-skeleton`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to sync curriculum skeleton.");
  }
  return res.json();
}

export async function importCurriculumExcel(file: File): Promise<{
  success: boolean;
  created: number;
  updated: number;
  total_records: number;
  total_chapters: number;
}> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/import-excel`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to import Excel curriculum.");
  }
  return res.json();
}

export function getCurriculumExportUrl(params?: {
  grade?: number;
  chapter?: string;
  category?: string;
  status?: CurriculumStatus;
  video_ids?: string[];
}): string {
  const query = new URLSearchParams();
  if (params?.grade) query.set("grade", String(params.grade));
  if (params?.chapter) query.set("chapter", params.chapter);
  if (params?.category) query.set("category", params.category);
  if (params?.status) query.set("status", params.status);
  if (params?.video_ids && params.video_ids.length > 0) {
    query.set("video_ids", params.video_ids.join(","));
  }
  return `${getApiBase()}/api/v1/curriculum/records/export?${query.toString()}`;
}

export const previewCurriculumCsvImport = previewCurriculumCSVImport;
export const commitCurriculumCsvImport = commitCurriculumCSVImport;
export const getCurriculumExportCsvUrl = getCurriculumExportUrl;

export async function fetchCurriculumHierarchy(params?: {
  grade?: number;
  chapter?: string;
  category?: string;
  status?: CurriculumStatus;
  search?: string;
}): Promise<CurriculumHierarchyResponse> {
  const query = new URLSearchParams();
  if (params?.grade) query.set("grade", String(params.grade));
  if (params?.chapter) query.set("chapter", params.chapter);
  if (params?.category) query.set("category", params.category);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);

  const res = await fetch(`${getApiBase()}/api/v1/curriculum/hierarchy?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load curriculum hierarchy.");
  }
  return res.json();
}

export async function fetchCurriculumSummary(): Promise<CurriculumSummaryResponse> {
  const res = await fetch(`${getApiBase()}/api/v1/curriculum/summary`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load curriculum summary.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Server-Sent Events (SSE) Real-Time Hookup
// ---------------------------------------------------------------------------

export interface CurriculumEvent {
  event:
    | "CONNECTED"
    | "RECORD_CREATED"
    | "RECORD_UPDATED"
    | "RECORD_DELETED"
    | "BULK_STATUS_UPDATED"
    | "BULK_DELETED"
    | "IMPORT_COMMITTED"
    | "pdf_asset_saved"
    | "pdf_asset_updated"
    | "pdf_asset_deleted"
    | "PDF_ASSET_SAVED"
    | "PDF_ASSET_UPDATED"
    | "PDF_ASSET_DELETED";
  data?: unknown;
  timestamp?: string;
}

export function subscribeCurriculumEvents(
  onEvent: (event: CurriculumEvent) => void,
  onError?: (err: Event | unknown) => void
): () => void {
  if (typeof window === "undefined" || !("EventSource" in window)) {
    return () => {};
  }

  const sseUrl = `${getApiBase()}/api/v1/curriculum/events`;
  const eventSource = new EventSource(sseUrl);

  eventSource.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data);
      onEvent(parsed);
    } catch (err) {
      console.debug("Failed parsing SSE event:", err);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
}

