import {
  UploadResponse,
  GenerateAssessmentResponse,
  AssessmentPayload,
  QuestionItem,
  SensorImageData,
} from "../types";

export type { UploadResponse };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function extractErrorMessage(err: unknown, fallback: string = "Request failed"): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.detail === "string" && record.detail) return record.detail;
    if (Array.isArray(record.detail) && record.detail.length > 0) {
      const first = record.detail[0];
      if (typeof first === "string") return first;
      if (first && typeof first === "object" && "msg" in first && typeof (first as { msg: unknown }).msg === "string") {
        return (first as { msg: string }).msg;
      }
    }
  }
  return fallback;
}

export async function checkBackendHealth(): Promise<{ status: string; service: string }> {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    if (!res.ok) throw new Error("Backend unavailable");
    return await res.json();
  } catch {
    return { status: "offline", service: "Unavailable" };
  }
}

export async function uploadCurriculumPdfs(
  files: File[],
  categoryMap?: Record<string, string>,
  signal?: AbortSignal
): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  if (categoryMap && Object.keys(categoryMap).length > 0) {
    formData.append("category_map", JSON.stringify(categoryMap));
  }

  const res = await fetch(`${API_BASE}/api/v1/upload-pdfs`, {
    method: "POST",
    body: formData,
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(extractErrorMessage(err, "Failed to upload curriculum PDFs"));
  }

  return await res.json();
}

export async function detectProjectName(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/v1/detect-project-name`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) return "STEM Curriculum Project";
  const data = await res.json();
  return data.project_name || "STEM Curriculum Project";
}

export async function generateAssessment(
  chapterContent: string,
  assessmentType: string,
  questionCount: number = 5,
  difficulty: string = "medium",
  provider: string = "auto",
  model?: string,
  rejectedQuestions?: string[],
  signal?: AbortSignal,
  availableImages?: SensorImageData[]
): Promise<GenerateAssessmentResponse> {
  const res = await fetch(`${API_BASE}/api/v1/generate-assessment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chapter_content: chapterContent,
      assessment_type: assessmentType,
      question_count: questionCount,
      difficulty,
      provider,
      model,
      rejected_questions: rejectedQuestions,
      available_images: availableImages,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Generation failed" }));
    throw new Error(extractErrorMessage(err, "Failed to generate assessment"));
  }

  return await res.json();
}

export async function generatePreAssembly(
  file: File,
  projectTitle?: string,
  signal?: AbortSignal
): Promise<GenerateAssessmentResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (projectTitle) formData.append("project_title", projectTitle);

  const res = await fetch(`${API_BASE}/api/v1/generate-pre-assembly`, {
    method: "POST",
    body: formData,
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Pre-assembly generation failed" }));
    throw new Error(extractErrorMessage(err, "Failed to generate pre-assembly assessment"));
  }

  return await res.json();
}

export async function downloadAssessmentPdf(payload: AssessmentPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/download-assessment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to download PDF" }));
    throw new Error(extractErrorMessage(err, "Failed to download PDF"));
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    const safeName = (payload.chapter_name || "Assessment").replace(/[^a-zA-Z0-9_-]/g, "_");
    a.download = `${safeName}_Assessment.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Delayed revocation ensures browser download manager has read the blob before release
    setTimeout(() => {
      try {
        window.URL.revokeObjectURL(url);
      } catch {
        // Ignore revocation errors
      }
    }, 1000);
  }
}

export async function fetchPreAssemblyProjects(): Promise<import("../types").ProjectSummary[]> {
  const res = await fetch(`${API_BASE}/api/v1/pre-assembly/projects`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load pre-assembly projects" }));
    throw new Error(extractErrorMessage(err, "Failed to load pre-assembly projects"));
  }
  return await res.json();
}

export async function generatePreAssemblyForProject(projectId: string): Promise<GenerateAssessmentResponse> {
  const res = await fetch(`${API_BASE}/api/v1/pre-assembly/generate-for-project?project_id=${encodeURIComponent(projectId)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to generate project quiz" }));
    throw new Error(extractErrorMessage(err, "Failed to generate project pre-assembly quiz"));
  }
  return await res.json();
}

export async function verifyPreAssembly(payload: {
  project_id: string;
  project_title: string;
  answers: Record<string, string>;
  questions: QuestionItem[] | unknown[];
}): Promise<import("../types").PreAssemblyVerifyResponse> {
  const res = await fetch(`${API_BASE}/api/v1/pre-assembly/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Quiz verification failed" }));
    throw new Error(extractErrorMessage(err, "Quiz verification failed"));
  }
  return await res.json();
}

export async function checkAssemblyStatus(projectId: string): Promise<import("../types").AssemblyAccessStatus> {
  const res = await fetch(`${API_BASE}/api/v1/assembly/status?project_id=${encodeURIComponent(projectId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to check assembly access status" }));
    throw new Error(extractErrorMessage(err, "Failed to check assembly access status"));
  }
  return await res.json();
}

export async function fetchChapterQuizzes(): Promise<import("../types").ChapterQuizzesOverview> {
  const res = await fetch(`${API_BASE}/api/v1/chapter/quizzes`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch chapter quizzes" }));
    throw new Error(extractErrorMessage(err, "Failed to fetch chapter quizzes"));
  }
  return await res.json();
}

export async function generateMergedAssessmentPaper(
  params?: {
    chapterContent?: string;
    questionCount?: number;
    difficulty?: string;
    provider?: string;
    model?: string;
    availableImages?: SensorImageData[];
  },
  signal?: AbortSignal
): Promise<GenerateAssessmentResponse> {
  const res = await fetch(`${API_BASE}/api/v1/assessment/merged-paper`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chapter_content: params?.chapterContent,
      question_count: params?.questionCount || 12,
      difficulty: params?.difficulty || "medium",
      provider: params?.provider || "auto",
      model: params?.model,
      available_images: params?.availableImages,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Merged assessment generation failed" }));
    throw new Error(extractErrorMessage(err, "Failed to generate merged assessment question paper"));
  }

  return await res.json();
}

export async function loadCurriculumChapter(grade: number, chapter?: string): Promise<UploadResponse> {
  let url = `${API_BASE}/api/v1/curriculum/load-chapter?grade=${grade}`;
  if (chapter && chapter.trim()) {
    url += `&chapter=${encodeURIComponent(chapter.trim())}`;
  }
  const res = await fetch(url, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load chapter materials" }));
    throw new Error(extractErrorMessage(err, `Failed to load Grade ${grade} curriculum`));
  }

  return await res.json();
}

export interface ServerVerificationRecord {
  id: string;
  project_id: string;
  project_title: string;
  passed: boolean;
  score: number;
  total: number;
  percentage: number;
  token: string | null;
  verified_at?: string;
}

export async function fetchAssemblyVerifications(): Promise<ServerVerificationRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/assembly/verifications`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export interface CurriculumOverviewResponse {
  grade: number;
  title: string;
  staged: boolean;
  topics: import("../types").TopicItem[];
  activities: import("../types").ActivityItem[];
  projects: import("../types").ProjectItem[];
  sensors: import("../types").SensorItem[];
  message?: string;
}

const curriculumCache = new Map<number, { data: CurriculumOverviewResponse; timestamp: number }>();
const CURRICULUM_CACHE_TTL_MS = 60_000; // 60 seconds

export async function fetchCurriculumOverview(
  grade: number,
  forceFresh: boolean = false
): Promise<CurriculumOverviewResponse> {
  if (!forceFresh) {
    const cached = curriculumCache.get(grade);
    if (cached && Date.now() - cached.timestamp < CURRICULUM_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const res = await fetch(`${API_BASE}/api/v1/curriculum/overview?grade=${grade}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to fetch curriculum overview" }));
    throw new Error(extractErrorMessage(err, `Failed to load Grade ${grade} curriculum`));
  }
  const data: CurriculumOverviewResponse = await res.json();
  curriculumCache.set(grade, { data, timestamp: Date.now() });
  return data;
}

export function invalidateCurriculumCache(grade?: number) {
  if (typeof grade === "number") {
    curriculumCache.delete(grade);
  } else {
    curriculumCache.clear();
  }
}


