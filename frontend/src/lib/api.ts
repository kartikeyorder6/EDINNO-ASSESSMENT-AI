import {
  UploadResponse,
  GenerateAssessmentResponse,
  AssessmentPayload,
} from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function checkBackendHealth(): Promise<{ status: string; service: string }> {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    if (!res.ok) throw new Error("Backend unavailable");
    return await res.json();
  } catch (e) {
    return { status: "offline", service: "Unavailable" };
  }
}

export async function uploadCurriculumPdfs(
  files: File[],
  categoryMap?: Record<string, string>
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
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Failed to upload curriculum PDFs");
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
  rejectedQuestions?: string[]
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
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Generation failed" }));
    throw new Error(err.detail || "Failed to generate assessment");
  }

  return await res.json();
}

export async function generatePreAssembly(
  file: File,
  projectTitle?: string
): Promise<GenerateAssessmentResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (projectTitle) formData.append("project_title", projectTitle);

  const res = await fetch(`${API_BASE}/api/v1/generate-pre-assembly`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Pre-assembly generation failed" }));
    throw new Error(err.detail || "Failed to generate pre-assembly assessment");
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
    throw new Error("Failed to download PDF");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = (payload.chapter_name || "Assessment").replace(/[^a-zA-Z0-9_-]/g, "_");
  a.download = `${safeName}_Assessment.pdf`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function fetchPreAssemblyProjects(): Promise<import("../types").ProjectSummary[]> {
  const res = await fetch(`${API_BASE}/api/v1/pre-assembly/projects`);
  if (!res.ok) {
    throw new Error("Failed to load pre-assembly projects");
  }
  return await res.json();
}

export async function generatePreAssemblyForProject(projectId: string): Promise<GenerateAssessmentResponse> {
  const res = await fetch(`${API_BASE}/api/v1/pre-assembly/generate-for-project?project_id=${encodeURIComponent(projectId)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to generate project quiz" }));
    throw new Error(err.detail || "Failed to generate project pre-assembly quiz");
  }
  return await res.json();
}

export async function verifyPreAssembly(payload: {
  project_id: string;
  project_title: string;
  answers: Record<string, string>;
  questions: any[];
}): Promise<import("../types").PreAssemblyVerifyResponse> {
  const res = await fetch(`${API_BASE}/api/v1/pre-assembly/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Quiz verification failed" }));
    throw new Error(err.detail || "Quiz verification failed");
  }
  return await res.json();
}

export async function checkAssemblyStatus(projectId: string): Promise<import("../types").AssemblyAccessStatus> {
  const res = await fetch(`${API_BASE}/api/v1/assembly/status?project_id=${encodeURIComponent(projectId)}`);
  if (!res.ok) {
    throw new Error("Failed to check assembly access status");
  }
  return await res.json();
}

export async function fetchChapterQuizzes(): Promise<import("../types").ChapterQuizzesOverview> {
  const res = await fetch(`${API_BASE}/api/v1/chapter/quizzes`);
  if (!res.ok) {
    throw new Error("Failed to fetch chapter quizzes");
  }
  return await res.json();
}

export async function generateMergedAssessmentPaper(params?: {
  chapterContent?: string;
  questionCount?: number;
  difficulty?: string;
  provider?: string;
  model?: string;
}): Promise<GenerateAssessmentResponse> {
  const res = await fetch(`${API_BASE}/api/v1/assessment/merged-paper`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chapter_content: params?.chapterContent,
      question_count: params?.questionCount || 12,
      difficulty: params?.difficulty || "medium",
      provider: params?.provider || "auto",
      model: params?.model,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Merged assessment generation failed" }));
    throw new Error(err.detail || "Failed to generate merged assessment question paper");
  }

  return await res.json();
}

