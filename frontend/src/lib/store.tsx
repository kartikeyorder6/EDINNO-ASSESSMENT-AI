"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { AssessmentPayload, QuestionItem, ResourceMetadata } from "../types";

interface AssessmentContextType {
  extractedResources: Record<string, string>;
  resourceMetadata: Record<string, ResourceMetadata>;
  activeChapterName: string;
  assessmentPayload: AssessmentPayload | null;
  setExtractedData: (
    resources: Record<string, string>,
    metadata?: Record<string, ResourceMetadata>,
    chapterName?: string
  ) => void;
  setAssessmentPayload: (payload: AssessmentPayload | null) => void;
  updateQuestion: (index: number, updated: QuestionItem) => void;
  addQuestion: (question: QuestionItem) => void;
  deleteQuestion: (index: number) => void;
  resetAll: () => void;
}

const AssessmentContext = createContext<AssessmentContextType | undefined>(undefined);

const LEGACY_KEYS = [
  "edinno_modern_resources",
  "edinno_modern_payload",
  "edinno_modern_chapter",
  "edinno_resources",
  "edinno_payload",
  "edinno_chapter",
];

const STORAGE_KEY_RESOURCES = "edinno_curriculum_v4_resources";
const STORAGE_KEY_METADATA = "edinno_curriculum_v4_metadata";
const STORAGE_KEY_PAYLOAD = "edinno_curriculum_v4_payload";
const STORAGE_KEY_CHAPTER = "edinno_curriculum_v4_chapter";

export function AssessmentProvider({ children }: { children: React.ReactNode }) {
  const [extractedResources, setExtractedResources] = useState<Record<string, string>>({});
  const [resourceMetadata, setResourceMetadata] = useState<Record<string, ResourceMetadata>>({});
  const [activeChapterName, setActiveChapterName] = useState<string>("");
  const [assessmentPayload, setAssessmentPayloadState] = useState<AssessmentPayload | null>(null);

  // Remove all cached data on page load/refresh so every refresh starts completely clean
  useEffect(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
  }, []);

  const setExtractedData = (
    resources: Record<string, string>,
    metadata: Record<string, ResourceMetadata> = {},
    chapterName: string = ""
  ) => {
    setExtractedResources(resources);
    setResourceMetadata(metadata);
    setActiveChapterName(chapterName);
  };

  const setAssessmentPayload = (payload: AssessmentPayload | null) => {
    setAssessmentPayloadState(payload);
  };

  const updateQuestion = (index: number, updated: QuestionItem) => {
    if (!assessmentPayload) return;
    const newQuestions = [...assessmentPayload.questions];
    newQuestions[index] = updated;
    const updatedPayload = { ...assessmentPayload, questions: newQuestions };
    setAssessmentPayload(updatedPayload);
  };

  const addQuestion = (question: QuestionItem) => {
    if (!assessmentPayload) return;
    const updatedPayload = {
      ...assessmentPayload,
      questions: [...assessmentPayload.questions, question],
    };
    setAssessmentPayload(updatedPayload);
  };

  const deleteQuestion = (index: number) => {
    if (!assessmentPayload) return;
    const newQuestions = assessmentPayload.questions.filter((_, i) => i !== index);
    const updatedPayload = { ...assessmentPayload, questions: newQuestions };
    setAssessmentPayload(updatedPayload);
  };

  const resetAll = () => {
    setExtractedResources({});
    setResourceMetadata({});
    setActiveChapterName("");
    setAssessmentPayloadState(null);
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
  };

  return (
    <AssessmentContext.Provider
      value={{
        extractedResources,
        resourceMetadata,
        activeChapterName,
        assessmentPayload,
        setExtractedData,
        setAssessmentPayload,
        updateQuestion,
        addQuestion,
        deleteQuestion,
        resetAll,
      }}
    >
      {children}
    </AssessmentContext.Provider>
  );
}

export function useAssessment() {
  const context = useContext(AssessmentContext);
  if (!context) {
    throw new Error("useAssessment must be used within an AssessmentProvider");
  }
  return context;
}
