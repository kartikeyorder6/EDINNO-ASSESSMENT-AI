/**
 * domain.ts - Unified domain schemas, entity contracts, and application models.
 * Serves as the single source of truth across the frontend.
 */

export interface TopicItem {
  id: string;
  title: string;
  filename?: string;
  description?: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  filename?: string;
  description?: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  filename?: string;
  description?: string;
}

export interface SensorItem {
  id: string;
  name: string;
  filename: string;
  caption: string;
  voltage?: string;
  interfaceType?: string;
  safetyRule?: string;
}

export interface ChapterItem {
  id: string;
  title: string;
  topics: TopicItem[];
  activities: ActivityItem[];
  projects: ProjectItem[];
  sensors: SensorItem[];
}

export interface GradeDefinition {
  id: number;
  name: string;
  theme?: string;
  badge?: string;
  hardwareKit?: string;
  chapters?: ChapterItem[];
}

export interface StudentTrackerRecord {
  id: string;
  name: string;
  email: string;
  grade: number;
  safetyScore: number;
  safetyPassed: boolean;
  token: string | null;
  assessmentAverage: number;
  hardwareKit: string;
  status: "verified" | "pending_retest" | "in_progress";
}

export interface GeneratedQuestion {
  id: string;
  type: "mcq" | "scenario" | "matching" | "true_false";
  difficulty: "foundation" | "standard" | "master";
  question: string;
  hardwareFocus: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  isSafetyGate?: boolean;
}

export interface SensorImageData {
  filename?: string;
  image_data?: string;
  caption?: string;
  page?: number;
  source_doc?: string;
  sensor_id?: string;
  path?: string;
}

export type StudioView = "curriculum" | "generate" | "tracker";
