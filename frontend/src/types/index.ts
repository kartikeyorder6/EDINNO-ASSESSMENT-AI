export * from "./domain";

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
  image_data?: string;
  image_caption?: string;
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

export type ResourceCategory = "topic" | "activity" | "project";

export interface ResourceMetadata {
  name: string;
  page_count: number;
  char_count: number;
  preview: string;
  category?: ResourceCategory | string;
  image_count?: number;
}

export interface ExtractedImageItem {
  image_data: string;
  caption?: string;
  page?: number;
  source_doc?: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  count: number;
  resources: Record<string, string>;
  metadata?: Record<string, ResourceMetadata>;
  suggested_chapter_title?: string;
  extracted_images?: ExtractedImageItem[];
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

export interface CloudinaryAssetMetadata {
  page_count?: number;
  char_count?: number;
  preview_text?: string;
  ocr_status?: string;
  extracted_at?: string;
  source?: string;
}

export interface CloudinaryAsset {
  id: string;
  public_id: string;
  asset_id?: string | null;
  grade: number;
  chapter: string;
  category: string;
  title: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  secure_url: string;
  preview_url?: string | null;
  version: number;
  sha256_hash?: string | null;
  metadata?: CloudinaryAssetMetadata;
  created_at: string;
  updated_at: string;
}

export interface CloudinaryAssetListResponse {
  success: boolean;
  total: number;
  page: number;
  page_size: number;
  items: CloudinaryAsset[];
}

export interface CloudinaryUploadResponse {
  success: boolean;
  message: string;
  asset: CloudinaryAsset;
  duplicate_detected?: boolean;
}

export interface CloudinaryConfigStatus {
  configured: boolean;
  cloud_name?: string | null;
  folder_prefix: string;
  max_file_size_bytes: number;
}
