"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { GradeDefinition, GeneratedQuestion, TopicItem } from "../types";
import { QuestionItem, AssessmentPayload, CloudinaryAsset } from "../../../types";
import { CurriculumRecord } from "../../../lib/curriculum-api";
import { useAssessment } from "../../../lib/store";
import { downloadAssessmentPdf, UploadResponse } from "../../../lib/api";
import QuestionCard from "../../../components/QuestionCard";
import { QuestionTypeBadge } from "../../../components/ui/QuestionTypeBadge";
import { Checkbox, SelectDropdown, SelectOption } from "../../../components/ui";
import { BLUEPRINT_TOKENS } from "../../../lib/design-tokens";
import {
  Sparkles,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  Printer,
  ShieldCheck,
  AlertCircle,
  FileDown,
  Plus,
  Pencil,
  X,
  LayoutGrid,
  Table as TableIcon,
  ChevronDown,
  ChevronUp,
  Sliders,
  CheckCircle2,
  FileText,
  Loader2,
  Cloud,
} from "lucide-react";

function cleanTitle(str: string): string {
  let s = (str || "")
    .split(/[\r\n]+/)[0]
    .replace(/^chapter\s*(name)?\s*[:\-]\s*/i, "")
    .replace(/\.pdf$/i, "")
    .replace(/_/g, " ")
    .replace(/^[\d._\-]+\s*/, "")
    .replace(/\s*[\(\[][\s\S]*?[\)\]]/g, "")
    .replace(/\s*-\s*merged\s*assessment\s*$/i, "")
    .replace(/\b(?:the\s+problem\s*(?:statement)?|problem\s*statement|the\s+problem|what\s+will\s+we\s+build)\b/gi, "")
    .replace(/\b(?:activity|project|module|unit|chapter|lesson|topic|p)\s*[\:\-]?\s*\d+\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[-_\s:,.]+|[-_\s:,.]+$/g, "")
    .trim();

  if (s.length > 55) {
    const cut = s.slice(0, 55).lastIndexOf(" ");
    if (cut > 5) s = s.slice(0, cut);
  }
  return s || "STEM Assessment";
}

interface AssessmentStudioProps {
  activeGrade: GradeDefinition;
  availableTopics?: TopicItem[];
  curriculumRecords?: CurriculumRecord[];
  curriculumChapters?: string[];
  gradeTitle?: string;
  staged?: boolean;
  selectedTopicIds: string[];
  onToggleTopic: (topicId: string, checked: boolean) => void;
  questionFormat: string;
  onChangeQuestionFormat: (format: string) => void;
  difficulty: "foundation" | "standard" | "master";
  onChangeDifficulty: (difficulty: "foundation" | "standard" | "master") => void;
  questionCount: number;
  onChangeQuestionCount: (count: number) => void;
  requireSafetyQuestions: boolean;
  onToggleRequireSafety: (checked: boolean) => void;
  isGenerating: boolean;
  onGenerate: (overrideParams?: { provider?: string; blueprint?: string; targetScope?: string }) => void;
  generatedQuestions?: GeneratedQuestion[];
  errorMsg?: string | null;
  selectedProvider?: string;
  onSelectProvider?: (provider: string) => void;
  onFetchChapterMaterials?: (chapter?: string) => Promise<UploadResponse | null>;
  isFetchingMaterials?: boolean;
  onOpenPdfStorage?: () => void;
  activePdfAssets?: CloudinaryAsset[];
  activePdfAsset?: CloudinaryAsset | null;
  onClearActivePdfAsset?: () => void;
  onClearActivePdfAssets?: () => void;
  onRemoveSinglePdfAsset?: (assetId: string) => void;
}

export function AssessmentStudio({
  activeGrade,
  availableTopics = [],
  curriculumRecords = [],
  curriculumChapters = [],
  gradeTitle,
  staged = true,
  selectedTopicIds,
  onToggleTopic,
  questionFormat,
  onChangeQuestionFormat,
  difficulty,
  onChangeDifficulty,
  questionCount,
  onChangeQuestionCount,
  requireSafetyQuestions,
  onToggleRequireSafety,
  isGenerating,
  onGenerate,
  generatedQuestions = [],
  errorMsg,
  selectedProvider = "gemini",
  onSelectProvider,
  onFetchChapterMaterials,
  isFetchingMaterials = false,
  onOpenPdfStorage,
  activePdfAssets,
  activePdfAsset,
  onClearActivePdfAsset,
  onClearActivePdfAssets,
  onRemoveSinglePdfAsset,
}: AssessmentStudioProps) {
  const {
    assessmentPayload,
    setAssessmentPayload,
    updateQuestion,
    addQuestion,
    deleteQuestion,
    extractedResources,
  } = useAssessment();

  // Local UI states
  const [showAnswerKeys, setShowAnswerKeys] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"cards" | "rubric">("cards");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [isConfigCollapsed, setIsConfigCollapsed] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [targetScope, setTargetScope] = useState<string>("ALL");
  const [showGuardrailsDetails, setShowGuardrailsDetails] = useState<boolean>(false);

  // Editable Assessment Title
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editableTitle, setEditableTitle] = useState<string>(() => {
    return cleanTitle(
      assessmentPayload?.chapter_name ||
        gradeTitle ||
        `${activeGrade.name} Assessment`
    );
  });

  // Unified list of attached Cloudinary assets
  const attachedAssets = useMemo(() => {
    if (activePdfAssets && activePdfAssets.length > 0) return activePdfAssets;
    if (activePdfAsset) return [activePdfAsset];
    return [];
  }, [activePdfAssets, activePdfAsset]);

  // Keep title updated when grade, attached assets, or assessmentPayload changes
  const currentDefaultTitle = useMemo(() => {
    if (attachedAssets.length === 1) return cleanTitle(attachedAssets[0].title);
    if (attachedAssets.length > 1) {
      const g = attachedAssets[0].grade;
      const allSame = attachedAssets.every((a) => a.grade === g);
      return allSame
        ? `Grade ${g} Curriculum Assessment (${attachedAssets.length} Modules)`
        : `Multi-Grade Curriculum Assessment (${attachedAssets.length} Modules)`;
    }
    if (assessmentPayload?.chapter_name) return cleanTitle(assessmentPayload.chapter_name);
    if (gradeTitle) return cleanTitle(gradeTitle);
    return `${activeGrade.name} Assessment`;
  }, [attachedAssets, assessmentPayload, gradeTitle, activeGrade]);

  const [prevDefaultTitle, setPrevDefaultTitle] = useState(currentDefaultTitle);
  if (currentDefaultTitle !== prevDefaultTitle) {
    setPrevDefaultTitle(currentDefaultTitle);
    setEditableTitle(currentDefaultTitle);
    if (attachedAssets.length === 1 && attachedAssets[0]?.chapter) {
      setTargetScope(`chapter:${attachedAssets[0].chapter}`);
    } else if (attachedAssets.length > 1) {
      setTargetScope("ALL");
    }
  }

  // Sync generatedQuestions from parent into assessmentPayload if payload is empty
  useEffect(() => {
    if (
      (!assessmentPayload || assessmentPayload.questions.length === 0) &&
      generatedQuestions &&
      generatedQuestions.length > 0
    ) {
      const convertedQuestions: QuestionItem[] = generatedQuestions.map((g, idx) => {
        const opts: Record<string, string> = {};
        if (Array.isArray(g.options)) {
          const letters = ["A", "B", "C", "D", "E", "F"];
          g.options.forEach((opt, oIdx) => {
            const letter = letters[oIdx] || String(oIdx + 1);
            opts[letter] = opt.replace(/^[A-F][\)\.]\s*/i, "");
          });
        }
        return {
          id: g.id || `q-${idx + 1}`,
          type: g.type,
          question: g.question,
          options: opts,
          answer: g.correctAnswer || "A",
          explanation: g.explanation || "",
          category: g.hardwareFocus || activeGrade.name,
          marks: 1,
        };
      });

      setAssessmentPayload({
        assessment_type: questionFormat,
        chapter_name: editableTitle,
        difficulty,
        provider: selectedProvider,
        model: "Standard",
        questions: convertedQuestions,
      });
    }
  }, [
    generatedQuestions,
    assessmentPayload,
    setAssessmentPayload,
    questionFormat,
    editableTitle,
    difficulty,
    selectedProvider,
    activeGrade.name,
  ]);

  // Collapse config panel once questions are generated without cascading effect
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  if (!hasAutoCollapsed && assessmentPayload && assessmentPayload.questions.length > 0) {
    setHasAutoCollapsed(true);
    setIsConfigCollapsed(true);
  }

  const activeQuestions: QuestionItem[] = useMemo(() => {
    return assessmentPayload?.questions || [];
  }, [assessmentPayload]);

  // Filtered questions
  const filteredQuestions = useMemo(() => {
    return activeQuestions
      .map((q, originalIndex) => ({ q, originalIndex }))
      .filter(({ q }) => {
        if (filterType === "ALL") return true;
        if (filterType === q.type) return true;
        if (filterType === q.category) return true;
        if (q.category && q.category.toLowerCase().includes(filterType.toLowerCase())) return true;
        if (filterType === "mcq" && (q.type === "mcq" || !q.type)) return true;
        if (filterType === "situation" && (q.type === "scenario" || q.type === "situation" || Boolean(q.scenario))) return true;
        if (q.question && q.question.toLowerCase().includes(filterType.toLowerCase())) return true;
        return false;
      });
  }, [activeQuestions, filterType]);

  const handleSaveTitle = () => {
    const trimmed = cleanTitle(editableTitle);
    if (!trimmed) return;
    setEditableTitle(trimmed);
    if (assessmentPayload) {
      setAssessmentPayload({
        ...assessmentPayload,
        chapter_name: trimmed,
      });
    }
    setIsEditingTitle(false);
  };

  const handleAddBlankQuestion = useCallback(() => {
    const randomSuffix = typeof window !== "undefined" && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : Math.random().toString(36).substring(2, 9);
    const newQ: QuestionItem = {
      id: `custom-q-${randomSuffix}`,
      type: "mcq",
      question: "Enter new evaluation question...",
      options: {
        A: "Option A",
        B: "Option B",
        C: "Option C",
        D: "Option D",
      },
      answer: "A",
      explanation: "Pedagogical rationale or hardware verification logic.",
      category: activeGrade.name,
      marks: 1,
    };
    addQuestion(newQ);
  }, [activeGrade.name, addQuestion]);

  const handleDuplicateQuestion = useCallback((idx: number) => {
    const target = activeQuestions[idx];
    if (!target) return;
    const randomSuffix = typeof window !== "undefined" && window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : Math.random().toString(36).substring(2, 9);
    const clone: QuestionItem = JSON.parse(JSON.stringify(target));
    clone.id = `copy-${randomSuffix}`;
    clone.question = `${clone.question} (Copy)`;
    addQuestion(clone);
  }, [activeQuestions, addQuestion]);

  const handleCopyQuestions = () => {
    if (activeQuestions.length === 0) return;
    const text = activeQuestions
      .map((q, idx) => {
        let optsText = "";
        if (q.options && typeof q.options === "object" && !Array.isArray(q.options)) {
          optsText = Object.entries(q.options)
            .map(([k, v]) => `  ${k}) ${v}`)
            .join("\n");
        } else if (Array.isArray(q.options)) {
          optsText = q.options.map((opt) => `  • ${opt}`).join("\n");
        }

        return `Question ${idx + 1} [${q.type?.toUpperCase() || "MCQ"}] (${q.category || activeGrade.name}):
${q.question}
${q.scenario ? `Scenario: ${q.scenario}\n` : ""}${optsText ? `\nOptions:\n${optsText}\n` : ""}
Correct Answer: ${q.answer}
Explanation: ${q.explanation || "Curriculum verification logic"}
----------------------------------------`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  const handleDownloadPdf = async () => {
    if (!assessmentPayload || activeQuestions.length === 0) return;

    setIsExportingPdf(true);
    setExportError(null);

    try {
      const payloadToSend: AssessmentPayload = {
        ...assessmentPayload,
        chapter_name: editableTitle || assessmentPayload.chapter_name || activeGrade.name,
      };
      await downloadAssessmentPdf(payloadToSend);
      setSuccessToast("Official Assessment PDF downloaded successfully!");
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setExportError(e.message || "Failed to download assessment PDF.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const totalMarks = useMemo(() => {
    return activeQuestions.reduce((acc, q) => acc + (q.marks || 1), 0);
  }, [activeQuestions]);

  const customUploadedDocKeys = useMemo(() => {
    return Object.keys(extractedResources || {});
  }, [extractedResources]);

  const canGenerate = useMemo(() => {
    return (
      curriculumRecords.length > 0 ||
      customUploadedDocKeys.length > 0 ||
      availableTopics.length > 0 ||
      Boolean(staged)
    );
  }, [curriculumRecords.length, customUploadedDocKeys.length, availableTopics.length, staged]);

  const selectedChapter = useMemo(() => {
    if (targetScope.startsWith("chapter:")) {
      return targetScope.replace(/^chapter:/, "");
    }
    return null;
  }, [targetScope]);

  const chapterRecords = useMemo(() => {
    if (!selectedChapter) return [];
    return curriculumRecords.filter((r) => r.chapter === selectedChapter);
  }, [selectedChapter, curriculumRecords]);

  const isScopeLoaded = useMemo(() => {
    if (!extractedResources || Object.keys(extractedResources).length === 0) return false;
    if (targetScope === "ALL") return true;
    if (selectedChapter) {
      const sc = selectedChapter.toLowerCase();
      return Object.keys(extractedResources).some(
        (k) =>
          k.toLowerCase().includes(sc) ||
          (extractedResources[k] && extractedResources[k].toLowerCase().includes(sc))
      );
    }
    if (targetScope.startsWith("doc:")) {
      const docKey = targetScope.replace(/^doc:/, "");
      return Boolean(extractedResources[docKey]);
    }
    return Boolean(extractedResources[targetScope]);
  }, [extractedResources, targetScope, selectedChapter]);

  const scopeOptions: SelectOption[] = useMemo(() => {
    const totalCount =
      curriculumRecords.length || availableTopics.length + customUploadedDocKeys.length;
    const opts: SelectOption[] = [];

    // If multiple Cloudinary PDFs are attached, provide an explicit option to target all attached
    if (attachedAssets.length > 1) {
      opts.push({
        value: "ALL",
        label: `All Attached Cloudinary Documents (${attachedAssets.length} Files)`,
        sublabel: `Synthesize questions across all ${attachedAssets.length} attached curriculum PDFs`,
        badge: { text: "Batch PDF", variant: "emerald" },
      });
    }

    opts.push({
      value: "ALL",
      label: `Entire ${activeGrade.name} Curriculum (${totalCount} Modules)`,
      sublabel: "Synthesize assessment questions across all curriculum modules",
    });

    // 0. Individual Attached Cloudinary Documents
    if (attachedAssets.length > 0) {
      attachedAssets.forEach((asset) => {
        const key = `${asset.category}-${asset.title}`;
        opts.push({
          value: `doc:${key}`,
          label: asset.title,
          sublabel: `${asset.category} • Grade ${asset.grade} • ${asset.metadata?.page_count || 1} pages`,
          badge: { text: asset.category, variant: "emerald" },
        });
      });
    }

    // 1. Chapters from Curriculum View
    if (curriculumChapters && curriculumChapters.length > 0) {
      curriculumChapters.forEach((ch) => {
        const count = curriculumRecords.filter((r) => r.chapter === ch).length;
        opts.push({
          value: `chapter:${ch}`,
          label: ch,
          sublabel: count > 0 ? `${count} Modules in Curriculum View` : "Curriculum Chapter",
          badge: { text: "Chapter", variant: "blue" },
        });
      });
    }

    // 2. Module categories
    const categories = Array.from(new Set(curriculumRecords.map((r) => r.category).filter(Boolean)));
    if (categories.length > 0) {
      categories.forEach((cat) => {
        const count = curriculumRecords.filter((r) => r.category === cat).length;
        opts.push({
          value: `category:${cat}`,
          label: `All ${cat} Modules`,
          sublabel: `${count} ${cat} records in curriculum`,
          badge: { text: cat, variant: "emerald" },
        });
      });
    }

    // 3. Uploaded custom documents/PDFs
    if (customUploadedDocKeys.length > 0) {
      customUploadedDocKeys.forEach((key) => {
        opts.push({
          value: `doc:${key}`,
          label: key,
          sublabel: "Extracted PDF Document",
          badge: { text: "PDF", variant: "purple" },
        });
      });
    }

    // 4. Fallback available topics if no chapters
    if ((!curriculumChapters || curriculumChapters.length === 0) && availableTopics.length > 0) {
      availableTopics.forEach((t) => {
        opts.push({
          value: t.id,
          label: t.title,
          sublabel: "Curriculum Module",
          badge: { text: "Topic", variant: "blue" },
        });
      });
    }

    return opts;
  }, [
    attachedAssets,
    activeGrade.name,
    curriculumRecords,
    curriculumChapters,
    customUploadedDocKeys,
    availableTopics,
  ]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white font-bold text-xs rounded shadow-xl shadow-emerald-950/20 border border-emerald-500 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* 1. Blueprint & Generation Configuration Panel */}
      <div className="rounded-md bg-white border border-stone-200/90 shadow-sm transition-all overflow-hidden">
        {/* Accordion Header */}
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-100">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200/80 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Assessment Studio & Blueprint Engine</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              Assessment Studio: {activeGrade.name}
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 font-medium">
              Configure question blueprints, select topic focus, and generate zero-hallucination evaluations.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {activeQuestions.length > 0 && (
              <button
                type="button"
                onClick={() => setIsConfigCollapsed((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-bold border border-stone-200 hover:bg-stone-50 text-stone-700 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-stone-500" />
                <span>{isConfigCollapsed ? "Show Blueprint Settings" : "Hide Settings"}</span>
                {isConfigCollapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => onGenerate({ provider: selectedProvider, blueprint: questionFormat, targetScope })}
              disabled={isGenerating || isFetchingMaterials || !canGenerate}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm disabled:opacity-50 transition-all cursor-pointer border border-blue-700"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Questions...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate AI Assessment</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Expandable Configuration Body */}
        {!isConfigCollapsed && (
          <div className="p-5 sm:p-6 space-y-6 bg-stone-50/40">
            {/* Blueprint Cards Selection */}
            <div className="space-y-3">
              <label className="text-xs font-black text-stone-800 uppercase tracking-wider block">
                1. Select Question Blueprint
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {BLUEPRINT_TOKENS.map((bp) => {
                  const isSelected = questionFormat === bp.id;
                  const Icon = bp.icon;
                  return (
                    <button
                      key={bp.id}
                      type="button"
                      onClick={() => {
                        onChangeQuestionFormat(bp.id);
                        if (bp.defaultQuestionCount) {
                          onChangeQuestionCount(bp.defaultQuestionCount);
                        }
                      }}
                      className={`text-left p-4 rounded-md border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                          : "bg-white border-stone-200/90 hover:border-blue-300"
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`p-1.5 rounded border ${bp.iconColor}`}>
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className="font-bold text-xs text-stone-900">{bp.title}</span>
                          </div>
                          {bp.badgeText && (
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                                bp.badgeColor || "bg-stone-100 text-stone-700"
                              }`}
                            >
                              {bp.badgeText}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
                          {bp.desc}
                        </p>
                      </div>

                      <div className="pt-3 mt-2 border-t border-stone-100 flex items-center justify-between text-[11px] font-bold text-stone-400">
                        <span className="text-blue-700 font-extrabold">{bp.tag}</span>
                        <span>{bp.defaultQuestionCount} Items</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Scope, AI Engine, Sliders */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
              {/* Target Scope Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-stone-800 uppercase tracking-wider block">
                    2. Target Scope
                  </label>
                  <div className="flex items-center gap-1.5">
                    {onOpenPdfStorage && (
                      <button
                        type="button"
                        onClick={onOpenPdfStorage}
                        className="text-[11px] font-bold text-[#B81104] hover:underline flex items-center gap-1 cursor-pointer bg-red-50/60 hover:bg-red-50 px-2 py-0.5 rounded border border-red-200 transition-colors"
                        title="Browse and select curriculum PDF(s) from Cloudinary Storage"
                      >
                        <Cloud className="w-3 h-3" />
                        <span>Curriculum PDFs</span>
                      </button>
                    )}
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {attachedAssets.length > 0
                        ? `${attachedAssets.length} Document${attachedAssets.length > 1 ? "s" : ""} Attached`
                        : targetScope === "ALL"
                        ? "Entire Curriculum"
                        : targetScope.startsWith("chapter:")
                        ? "Curriculum Chapter"
                        : targetScope.startsWith("category:")
                        ? "Module Category"
                        : "Single Module"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <SelectDropdown
                    value={targetScope}
                    onChange={(val) => setTargetScope(val)}
                    options={scopeOptions}
                    size="sm"
                  />

                  {/* Active Cloudinary PDF(s) Card */}
                  {attachedAssets.length > 0 && (
                    <div className="p-3 rounded bg-emerald-50/80 border border-emerald-200 space-y-2 shadow-2xs animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                          <Cloud className="w-3.5 h-3.5 text-emerald-700" />
                          <span>
                            {attachedAssets.length === 1
                              ? "Cloudinary PDF Attached"
                              : `${attachedAssets.length} Cloudinary PDFs Attached`}
                          </span>
                        </div>
                        {(onClearActivePdfAssets || onClearActivePdfAsset) && (
                          <button
                            type="button"
                            onClick={onClearActivePdfAssets || onClearActivePdfAsset}
                            className="text-stone-400 hover:text-stone-700 text-[10px] font-bold cursor-pointer"
                          >
                            Clear All
                          </button>
                        )}
                      </div>

                      {attachedAssets.length === 1 ? (
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
                          <div className="truncate">
                            <div
                              className="text-xs font-black text-stone-900 truncate"
                              title={attachedAssets[0].title}
                            >
                              {attachedAssets[0].title}
                            </div>
                            <div className="text-[10px] text-stone-600">
                              {attachedAssets[0].category} &bull; Grade {attachedAssets[0].grade} &bull;{" "}
                              {attachedAssets[0].metadata?.page_count || 1} pages &bull; v{attachedAssets[0].version}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 divide-y divide-emerald-100/60">
                          {attachedAssets.map((asset) => (
                            <div
                              key={asset.id}
                              className="pt-1.5 first:pt-0 flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <div className="truncate">
                                  <div
                                    className="text-xs font-bold text-stone-900 truncate"
                                    title={asset.title}
                                  >
                                    {asset.title}
                                  </div>
                                  <div className="text-[10px] text-stone-500">
                                    {asset.category} &bull; {asset.metadata?.page_count || 1}p &bull; v{asset.version}
                                  </div>
                                </div>
                              </div>
                              {onRemoveSinglePdfAsset && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveSinglePdfAsset(asset.id)}
                                  className="text-stone-400 hover:text-red-600 p-1 rounded cursor-pointer"
                                  title="Remove document from scope"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-[10px] text-emerald-800 leading-relaxed pt-1 border-t border-emerald-100">
                        AI will synthesize questions from authentic curriculum OCR specifications
                        {attachedAssets.length > 1
                          ? ` across all ${attachedAssets.length} documents.`
                          : "."}
                      </p>
                    </div>
                  )}

                  {/* Chapter-specific scope status & synchronization panel */}
                  {selectedChapter && (
                    <div className="p-3 rounded bg-stone-50 border border-stone-200 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-stone-800 truncate">
                          <Sparkles className="w-3.5 h-3.5 text-[#B81104] shrink-0" />
                          <span className="truncate">{selectedChapter}</span>
                        </div>
                        <span className="text-[10px] font-semibold text-stone-500 shrink-0">
                          {chapterRecords.length} in Curriculum
                        </span>
                      </div>

                      {isScopeLoaded ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Chapter materials active &amp; ready for AI evaluation</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-amber-800 bg-amber-50 px-2 py-1 rounded border border-amber-200 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Materials will auto-sync on generation, or sync now:</span>
                          </p>
                          {onFetchChapterMaterials && (
                            <button
                              type="button"
                              onClick={() => onFetchChapterMaterials(selectedChapter)}
                              disabled={isFetchingMaterials}
                              className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isFetchingMaterials ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B81104]" />
                                  <span>Syncing Chapter Data...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 text-[#B81104]" />
                                  <span>Fetch &amp; Sync Chapter Materials</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {chapterRecords.length > 0 && (
                        <div className="text-[10px] text-stone-500 space-y-0.5 pt-1 border-t border-stone-200/60 max-h-24 overflow-y-auto">
                          <span className="font-bold text-stone-600 block">Curriculum Modules:</span>
                          {chapterRecords.map((r) => (
                            <div key={r.video_id} className="truncate">
                              • <span className="font-semibold text-stone-700">{r.video_id}</span> ({r.category})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Topic checklist when Entire Curriculum is selected */}
                  {targetScope === "ALL" && (
                    <div className="p-3 rounded bg-white border border-stone-200 space-y-2 max-h-40 overflow-y-auto">
                      <div className="flex items-center justify-between pb-1 border-b border-stone-100 text-[10px] font-bold text-stone-500">
                        <span>
                          Curriculum Scope ({curriculumRecords.length || availableTopics.length} Modules)
                        </span>
                        {onFetchChapterMaterials && (
                          <button
                            type="button"
                            onClick={() => onFetchChapterMaterials()}
                            disabled={isFetchingMaterials}
                            className="text-[#B81104] hover:underline flex items-center gap-1 cursor-pointer font-bold disabled:opacity-50"
                          >
                            {isFetchingMaterials ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                            <span>Sync All</span>
                          </button>
                        )}
                      </div>
                      {curriculumRecords.length > 0 ? (
                        <div className="space-y-1">
                          {curriculumRecords.slice(0, 12).map((r) => (
                            <div
                              key={r.video_id}
                              className="text-xs text-stone-700 flex items-center justify-between py-0.5"
                            >
                              <span className="truncate font-semibold">{r.video_id}</span>
                              <span className="text-[10px] text-stone-500 bg-stone-100 px-1 rounded">
                                {r.category}
                              </span>
                            </div>
                          ))}
                          {curriculumRecords.length > 12 && (
                            <p className="text-[10px] text-stone-400 italic pt-1">
                              + {curriculumRecords.length - 12} more curriculum records
                            </p>
                          )}
                        </div>
                      ) : availableTopics.length > 0 ? (
                        availableTopics.map((t) => {
                          const isChecked = selectedTopicIds.includes(t.id);
                          return (
                            <div key={t.id} className="py-0.5">
                              <Checkbox
                                size="sm"
                                checked={isChecked}
                                onChange={(checked) => onToggleTopic(t.id, checked)}
                                label={<span className="truncate block max-w-xs">{t.title}</span>}
                              />
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-2 text-center space-y-1">
                          <p className="text-xs text-stone-400 italic">
                            No curriculum records currently staged. Add records in Curriculum View or upload course PDFs in Ingest.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* AI Engine & Difficulty */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-stone-800 uppercase tracking-wider block">
                    3. AI Engine Provider
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "gemini", label: "Google Gemini 3.6 Flash", tag: "Flagship" },
                      { id: "auto", label: "Auto Smart Cascade", tag: "Recommended" },
                      { id: "groq", label: "Groq LPU Acceleration", tag: "Ultra-Fast" },
                      { id: "openrouter", label: "OpenRouter Cloud", tag: "Multi-Model" },
                      { id: "ollama", label: "Local Offline Ollama", tag: "Air-Gapped" },
                    ].map((p) => {
                      const isSel = (selectedProvider || "gemini") === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onSelectProvider?.(p.id)}
                          className={`p-2 rounded text-xs font-bold text-center border transition-all cursor-pointer ${
                            isSel
                              ? "bg-blue-50 text-blue-900 border-blue-300 shadow-xs ring-1 ring-blue-400/30"
                              : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                          }`}
                        >
                          <div className="truncate">{p.label}</div>
                          <span className={`text-[9px] font-semibold block ${isSel ? "text-blue-700" : "text-stone-400"}`}>
                            {p.tag}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-stone-800 uppercase tracking-wider block">
                    4. Difficulty Level
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: "foundation", label: "Foundation" },
                      { id: "standard", label: "Standard Lab" },
                      { id: "master", label: "Hardware Pro" },
                    ].map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() =>
                          onChangeDifficulty(lvl.id as "foundation" | "standard" | "master")
                        }
                        className={`flex-1 py-1.5 rounded text-xs font-bold border transition-all cursor-pointer ${
                          difficulty === lvl.id
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                        }`}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Question Count & Safety Gate */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-stone-800 uppercase tracking-wider">
                      5. Question Count
                    </label>
                    <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                      {questionCount} Questions
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={20}
                    value={questionCount}
                    onChange={(e) => onChangeQuestionCount(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-stone-400 font-bold">
                    <span>3 (Quick Check)</span>
                    <span>10 (Standard)</span>
                    <span>20 (Full Exam)</span>
                  </div>
                </div>

                <div className="p-3 rounded bg-white border border-stone-200">
                  <Checkbox
                    checked={requireSafetyQuestions}
                    onChange={(checked) => onToggleRequireSafety(checked)}
                    label="Include Lab Safety & Voltage Checks"
                    description="Embeds strict voltage limits, short circuit hazard checks, and pin rating questions."
                  />
                </div>
              </div>
            </div>

            {/* Zero-Hallucination Guardrails Details Panel */}
            <div className="rounded-md border border-emerald-200/90 bg-emerald-50/50 p-4 transition-all">
              <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setShowGuardrailsDetails((prev) => !prev)}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                    Zero-Hallucination Hardware Guardrails
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Active (4 Layers)
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">
                  <span>{showGuardrailsDetails ? "Hide Architecture" : "View Architecture"}</span>
                  {showGuardrailsDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </div>

              {showGuardrailsDetails && (
                <div className="mt-3 pt-3 border-t border-emerald-200/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-in fade-in duration-200">
                  <div className="p-3 rounded bg-white/90 border border-emerald-200/70 space-y-1">
                    <span className="font-extrabold text-emerald-900 block text-[11px]">
                      1. Pinout Verification
                    </span>
                    <p className="text-[10px] text-stone-600 leading-relaxed">
                      Microcontroller pin assignments and bus types (I2C, SPI, UART) are validated against official board schematics.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-white/90 border border-emerald-200/70 space-y-1">
                    <span className="font-extrabold text-emerald-900 block text-[11px]">
                      2. Electrical Safety Checks
                    </span>
                    <p className="text-[10px] text-stone-600 leading-relaxed">
                      3.3V vs 5V voltage rail mismatches and current limits are strictly enforced; short-circuit hazards are flagged.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-white/90 border border-emerald-200/70 space-y-1">
                    <span className="font-extrabold text-emerald-900 block text-[11px]">
                      3. Anti-Code Purity
                    </span>
                    <p className="text-[10px] text-stone-600 leading-relaxed">
                      Zero program code snippets or circuit wiring diagrams in questions, ensuring pure conceptual and hardware logic.
                    </p>
                  </div>
                  <div className="p-3 rounded bg-white/90 border border-emerald-200/70 space-y-1">
                    <span className="font-extrabold text-emerald-900 block text-[11px]">
                      4. Misconception Distractors
                    </span>
                    <p className="text-[10px] text-stone-600 leading-relaxed">
                      All multiple-choice options reflect genuine student hardware misunderstandings with step-by-step diagnostic feedback.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Generation Error Feedback */}
      {(errorMsg || exportError) && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 flex items-center justify-between text-xs text-red-900 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg || exportError}</span>
          </div>
          {errorMsg && (
            <button
              type="button"
              onClick={() => onGenerate({ provider: selectedProvider, blueprint: questionFormat, targetScope })}
              disabled={isGenerating || isFetchingMaterials}
              className="font-bold text-red-700 hover:underline cursor-pointer"
            >
              Retry Generation
            </button>
          )}
        </div>
      )}

      {/* 2. Interactive Question Workbench */}
      {activeQuestions.length > 0 ? (
        <div className="space-y-4">
          {/* Assessment Workbench Header */}
          <div className="p-5 sm:p-6 bg-white rounded-md border border-stone-200/90 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              {/* Editable Title */}
              <div className="flex-1 min-w-0">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2 max-w-xl">
                    <input
                      type="text"
                      value={editableTitle}
                      onChange={(e) => setEditableTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                      autoFocus
                      className="text-lg font-black text-stone-900 border border-blue-400 rounded px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleSaveTitle}
                      className="p-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      title="Save Title"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(false)}
                      className="p-2 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg sm:text-xl font-black text-stone-900 tracking-tight">
                      {editableTitle}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(true)}
                      className="p-1 rounded-md text-stone-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                      title="Edit Assessment Title"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-stone-500">
                    {activeGrade.name} • {activeQuestions.length} Questions • {totalMarks} Total Marks
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1 border border-emerald-200">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>0-Hallucination Verified</span>
                  </span>
                </div>
              </div>

              {/* Primary Actions: Download PDF, Add Question */}
              <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleAddBlankQuestion}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-bold border border-stone-200 hover:bg-stone-50 text-stone-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  <span>Add Question</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isExportingPdf}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm border border-blue-700 cursor-pointer transition-all disabled:opacity-50"
                >
                  {isExportingPdf ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating PDF...</span>
                    </>
                  ) : (
                    <>
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Download Official PDF</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Workbench Secondary Toolbar: Filters, Views, Toggles */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              {/* Category & Type Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: "ALL", label: `All (${activeQuestions.length})` },
                  { id: "mcq", label: `MCQs (${activeQuestions.filter(q => q.type === "mcq" || !q.type).length})` },
                  { id: "true_false", label: `True/False (${activeQuestions.filter(q => q.type === "true_false").length})` },
                  { id: "situation", label: `Scenarios (${activeQuestions.filter(q => q.type === "situation" || q.type === "scenario" || Boolean(q.scenario)).length})` },
                  { id: "Component Identification & Functions", label: "Components & Pins" },
                  { id: "Logical Reasoning", label: "Logical Reasoning" },
                ]
                  .filter((f) => {
                    if (["ALL", "mcq", "true_false", "situation"].includes(f.id)) return true;
                    return activeQuestions.some(
                      (q) =>
                        (q.category && q.category.toLowerCase().includes(f.id.toLowerCase())) ||
                        (q.question && q.question.toLowerCase().includes(f.id.toLowerCase()))
                    );
                  })
                  .map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilterType(f.id)}
                      className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        filterType === f.id
                          ? "bg-stone-900 text-white shadow-xs"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
              </div>

              {/* View Switcher, Answer Keys, Copy, Print */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Cards vs Rubric View Toggle */}
                <div className="flex items-center bg-stone-100 p-0.5 rounded border border-stone-200">
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`p-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      viewMode === "cards"
                        ? "bg-white text-stone-900 shadow-xs"
                        : "text-stone-500 hover:text-stone-800"
                    }`}
                    title="Interactive Cards View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("rubric")}
                    className={`p-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      viewMode === "rubric"
                        ? "bg-white text-stone-900 shadow-xs"
                        : "text-stone-500 hover:text-stone-800"
                    }`}
                    title="Pedagogical Rubric Matrix"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Reveal Answer Keys */}
                <button
                  type="button"
                  onClick={() => setShowAnswerKeys(!showAnswerKeys)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border border-stone-200 hover:bg-stone-50 text-stone-700 cursor-pointer"
                >
                  {showAnswerKeys ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-stone-500" />
                      <span>Hide Keys</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                      <span>Reveal Keys</span>
                    </>
                  )}
                </button>

                {/* Copy Quiz */}
                <button
                  type="button"
                  onClick={handleCopyQuestions}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border border-stone-200 hover:bg-stone-50 text-stone-700 cursor-pointer"
                >
                  {copiedNotification ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-stone-500" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                {/* Print */}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border border-stone-200 hover:bg-stone-50 text-stone-700 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-stone-500" />
                  <span>Print</span>
                </button>
              </div>
            </div>
          </div>

          {/* Question Cards View */}
          {viewMode === "cards" && (
            <div className="space-y-4">
              {filteredQuestions.length === 0 ? (
                <div className="p-8 bg-white border border-stone-200 rounded-md text-center text-xs text-stone-500">
                  No questions match the selected &quot;{filterType}&quot; filter.
                </div>
              ) : (
                filteredQuestions.map(({ q, originalIndex }) => (
                  <QuestionCard
                    key={q.id || originalIndex}
                    index={originalIndex}
                    question={q}
                    showAnswers={showAnswerKeys}
                    onUpdate={(updated) => updateQuestion(originalIndex, updated)}
                    onDelete={() => deleteQuestion(originalIndex)}
                    onDuplicate={() => handleDuplicateQuestion(originalIndex)}
                  />
                ))
              )}
            </div>
          )}

          {/* Pedagogical Rubric Matrix Table View */}
          {viewMode === "rubric" && (
            <div className="rounded-md bg-white border border-stone-200/90 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4 w-12 text-center">#</th>
                      <th className="py-3 px-4 w-28">Type</th>
                      <th className="py-3 px-4 min-w-[280px]">Question &amp; Problem Statement</th>
                      <th className="py-3 px-4 w-28 text-center">Key</th>
                      <th className="py-3 px-4 min-w-[240px]">Pedagogical Rationale &amp; Rubric</th>
                      <th className="py-3 px-4 w-16 text-center">Marks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredQuestions.map(({ q, originalIndex }) => (
                      <tr
                        key={q.id || originalIndex}
                        className="hover:bg-blue-50/30 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-bold text-stone-900 text-center">
                          {originalIndex + 1}
                        </td>
                        <td className="py-3.5 px-4">
                          <QuestionTypeBadge type={q.type} />
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-stone-900 leading-relaxed">
                          {q.scenario && (
                            <div className="mb-1 text-[11px] font-medium text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                              <span className="font-bold">Scenario:</span> {q.scenario}
                            </div>
                          )}
                          <div>{q.question}</div>
                          {q.options && typeof q.options === "object" && (
                            <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-stone-600">
                              {Object.entries(q.options).map(([k, v]) => (
                                <span
                                  key={k}
                                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    showAnswerKeys &&
                                    (q.answer?.toUpperCase() === k.toUpperCase() || q.answer === v)
                                      ? "bg-emerald-100 text-emerald-800 font-bold border border-emerald-300"
                                      : "bg-stone-100 text-stone-700"
                                  }`}
                                >
                                  {k}) {v}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-black text-emerald-700">
                          {showAnswerKeys ? q.answer || "—" : "•••"}
                        </td>
                        <td className="py-3.5 px-4 text-[11px] text-stone-600 leading-relaxed">
                          {q.explanation || "Curriculum hardware standard."}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-stone-800">
                          {q.marks || 1}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="p-12 rounded-md bg-white border-2 border-dashed border-stone-200 text-center space-y-4">
          <div className="w-14 h-14 rounded-md bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7 text-blue-600" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-extrabold text-stone-900">
              Ready to Generate Assessment for {activeGrade.name}
            </h3>
            <p className="text-xs text-stone-500 font-medium">
              Click &ldquo;Generate AI Assessment&rdquo; to build hardware-grounded evaluation
              questions covering {gradeTitle || activeGrade.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onGenerate({ provider: selectedProvider, blueprint: questionFormat, targetScope })}
            disabled={isGenerating || isFetchingMaterials || !canGenerate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer shadow-sm transition-all border border-blue-700 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Generate Assessment Now</span>
          </button>
        </div>
      )}
    </div>
  );
}
