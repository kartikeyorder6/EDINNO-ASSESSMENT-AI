/**
 * curriculum-data.ts - Authentic STEM grade definitions for Grades 6 through 12.
 * Real curriculum topics, activities, projects, and sensors are fetched dynamically from the backend API.
 */

import {
  TopicItem,
  ActivityItem,
  ProjectItem,
  SensorItem,
  ChapterItem,
  GradeDefinition,
} from "../types/domain";

export type {
  TopicItem,
  ActivityItem,
  ProjectItem,
  SensorItem,
  ChapterItem,
  GradeDefinition,
};

export const GRADES_DATA: Record<number, GradeDefinition> = {
  6: {
    id: 6,
    name: "Grade 6",
  },
  7: {
    id: 7,
    name: "Grade 7",
  },
  8: {
    id: 8,
    name: "Grade 8",
  },
  9: {
    id: 9,
    name: "Grade 9",
  },
  10: {
    id: 10,
    name: "Grade 10",
  },
  11: {
    id: 11,
    name: "Grade 11",
  },
  12: {
    id: 12,
    name: "Grade 12",
  },
};

export const ALL_GRADES: number[] = [6, 7, 8, 9, 10, 11, 12];

export function getGrade(id: number): GradeDefinition {
  return GRADES_DATA[id] || { id, name: `Grade ${id}` };
}
