export type QuestionType =
  | "mcq"
  | "true_false"
  | "general"
  | "matching"
  | "situation";

export interface QuestionItem {
  id?: string | number;
  type: QuestionType | string;
  question: string;
  options?: Record<string, string> | string[];
  answer: string;
  explanation?: string;
  scenario?: string;
  marks?: number;
  section?: string;
  category?: string;
}

export interface AssessmentPayload {
  assessment_type: string;
  chapter_name: string;
  project_name?: string;
  difficulty?: string;
  provider?: string;
  model?: string;
  questions: QuestionItem[];
}

export type ResourceCategory = "topic" | "activity" | "project" | "resource";

export interface ResourceMetadata {
  name: string;
  page_count: number;
  char_count: number;
  preview: string;
  category?: ResourceCategory | string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  count: number;
  resources: Record<string, string>;
  metadata?: Record<string, ResourceMetadata>;
}

export interface GenerateAssessmentResponse {
  success: boolean;
  message: string;
  assessment_type: string;
  chapter_name: string;
  questions: QuestionItem[];
  metadata?: {
    question_count?: number;
    difficulty?: string;
    provider?: string;
    model?: string;
  };
}

export interface ProjectSummary {
  id: string;
  title: string;
  filename: string;
  category?: string;
  has_pre_assembly?: boolean;
  completed?: boolean;
  score?: number | null;
}

export interface QuizQuestionDetail {
  id: string | number;
  question: string;
  user_answer?: string | null;
  correct_answer: string;
  is_correct: boolean;
  explanation?: string;
}

export interface PreAssemblyVerifyResponse {
  success: boolean;
  passed: boolean;
  score: number;
  total: number;
  percentage: number;
  passing_threshold: number;
  authorization_token?: string | null;
  message: string;
  project_id: string;
  project_title: string;
  details: QuizQuestionDetail[];
}

export interface AssemblyAccessStatus {
  allowed: boolean;
  project_id: string;
  project_title: string;
  status: "VERIFIED" | "PENDING_QUIZ" | "FAILED_QUIZ" | string;
  score?: number | null;
  total?: number | null;
  authorization_token?: string | null;
  message: string;
}

export interface ChapterQuizzesOverview {
  chapter_name: string;
  modules: Array<{
    category: ResourceCategory;
    title: string;
    count: number;
    description: string;
    completed?: number;
    quiz_available: boolean;
  }>;
  progress: {
    total_projects: number;
    completed_projects: number;
    percentage: number;
  };
}
