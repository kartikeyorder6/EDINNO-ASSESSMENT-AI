"use client";

import React, { createContext, useContext, useState } from "react";
import { AssessmentPayload, ExtractedImageItem, QuestionItem, ResourceMetadata } from "../types";

interface AssessmentContextType {
  extractedResources: Record<string, string>;
  resourceMetadata: Record<string, ResourceMetadata>;
  extractedImages: ExtractedImageItem[];
  activeChapterName: string;
  assessmentPayload: AssessmentPayload | null;
  setExtractedData: (
    resources: Record<string, string>,
    metadata?: Record<string, ResourceMetadata>,
    chapterName?: string,
    images?: ExtractedImageItem[]
  ) => void;
  setAssessmentPayload: (payload: AssessmentPayload | null) => void;
  updateQuestion: (index: number, updated: QuestionItem) => void;
  addQuestion: (question: QuestionItem) => void;
  deleteQuestion: (index: number) => void;
  resetAll: () => void;
}

const AssessmentContext = createContext<AssessmentContextType | undefined>(undefined);



export function AssessmentProvider({ children }: { children: React.ReactNode }) {
  const [extractedResources, setExtractedResources] = useState<Record<string, string>>({});
  const [resourceMetadata, setResourceMetadata] = useState<Record<string, ResourceMetadata>>({});
  const [extractedImages, setExtractedImages] = useState<ExtractedImageItem[]>([]);
  const [activeChapterName, setActiveChapterName] = useState<string>("");
  const [assessmentPayload, setAssessmentPayloadState] = useState<AssessmentPayload | null>(null);

  const setExtractedData = (
    resources: Record<string, string>,
    metadata: Record<string, ResourceMetadata> = {},
    chapterName: string = "",
    images: ExtractedImageItem[] = []
  ) => {
    setExtractedResources(resources);
    setResourceMetadata(metadata);
    setActiveChapterName(chapterName);
    setExtractedImages(images);
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
    setExtractedImages([]);
    setActiveChapterName("");
    setAssessmentPayloadState(null);
    try {
      sessionStorage.clear();
    } catch {
      // Ignored
    }
  };

  return (
    <AssessmentContext.Provider
      value={{
        extractedResources,
        resourceMetadata,
        extractedImages,
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
