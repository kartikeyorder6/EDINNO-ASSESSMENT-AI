"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import QuestionCard from "../../components/QuestionCard";
import { useAssessment } from "../../lib/store";
import { downloadAssessmentPdf } from "../../lib/api";
import { QuestionItem } from "../../types";
import { AppHeader } from "../../components/layout/AppHeader";
import StepProgress from "../../components/StepProgress";
import {
  FileDown,
  Plus,
  Eye,
  EyeOff,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Pencil,
} from "lucide-react";

export default function ResultsPage() {
  const router = useRouter();
  const {
    assessmentPayload,
    setAssessmentPayload,
    updateQuestion,
    addQuestion,
    deleteQuestion,
  } = useAssessment();

  const [showAnswers, setShowAnswers] = useState<boolean>(true);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);

  const cleanTitle = (str: string) => {
    return (str || "")
      .replace(/^chapter\s*(name)?\s*[:\-]\s*/i, "")
      .replace(/\s*[\(\[][\s\S]*?[\)\]]/g, "")
      .trim();
  };

  const [editableChapterName, setEditableChapterName] = useState<string>(() => {
    return cleanTitle(assessmentPayload?.chapter_name || "") || assessmentPayload?.chapter_name || "";
  });

  // Pure React state synchronization without cascading renders
  const [prevChapterName, setPrevChapterName] = useState(assessmentPayload?.chapter_name);
  if (assessmentPayload?.chapter_name && assessmentPayload.chapter_name !== prevChapterName) {
    setPrevChapterName(assessmentPayload.chapter_name);
    const stripped = cleanTitle(assessmentPayload.chapter_name);
    setEditableChapterName(stripped || assessmentPayload.chapter_name);
  }

  const questions = assessmentPayload?.questions || [];
  const chapterName = assessmentPayload?.chapter_name || "Curriculum Assessment";

  const handleSaveTitle = () => {
    const trimmed = cleanTitle(editableChapterName);
    if (!trimmed) return;
    if (assessmentPayload) {
      setAssessmentPayload({
        ...assessmentPayload,
        chapter_name: trimmed,
      });
    }
    setEditableChapterName(trimmed);
    setIsEditingTitle(false);
  };

  const filteredQuestions = questions.filter((q) => {
    if (filterType === "ALL") return true;
    if (filterType === q.type) return true;
    if (filterType === q.category) return true;
    if (q.category && q.category.toLowerCase().includes(filterType.toLowerCase())) return true;
    if (q.question && q.question.toLowerCase().includes(filterType.toLowerCase())) return true;
    if (filterType === "mcq" && (q.type === "mcq" || !q.type)) return true;
    if (filterType === "situation" && (q.type === "situation" || q.type === "scenario" || Boolean(q.scenario))) return true;
    return false;
  });

  const handleDownloadPdf = async () => {
    if (!assessmentPayload || questions.length === 0) return;

    setIsExporting(true);
    setErrorMsg(null);

    try {
      const trimmedTitle = editableChapterName.trim() || assessmentPayload.chapter_name;
      const payloadToSend = {
        ...assessmentPayload,
        chapter_name: trimmedTitle,
      };
      await downloadAssessmentPdf(payloadToSend);
      setSuccessToast("Official Assessment PDF generated & downloaded!");
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErrorMsg(err.message || "Failed to download assessment PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleAddQuestion = () => {
    const newQ: QuestionItem = {
      type: "mcq",
      question: "New question prompt here...",
      options: {
        A: "Option A",
        B: "Option B",
        C: "Option C",
        D: "Option D",
      },
      answer: "A",
      explanation: "Provide brief grading rationale or correct concept.",
    };
    addQuestion(newQ);
  };

  const handleDuplicateQuestion = (idx: number) => {
    const target = questions[idx];
    if (!target) return;
    const clone: QuestionItem = JSON.parse(JSON.stringify(target));
    clone.question = `${clone.question} (Copy)`;
    addQuestion(clone);
  };

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#FDFBF7]">
        <AppHeader activePage="results" />
        <StepProgress currentStep={4} />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="bg-white border border-[#EAE5D9] rounded-lg p-8 sm:p-12 text-center max-w-lg mx-auto shadow-xs">
            <div className="w-12 h-12 rounded-md bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-stone-900 mb-2">No Assessment Generated Yet</h2>
            <p className="text-xs sm:text-sm text-stone-500 mb-6 leading-relaxed">
              Upload curriculum PDF documents and configure blueprint parameters to preview, edit, and download your assessment question paper.
            </p>
            <button
              onClick={() => router.push("/ingest")}
              className="px-5 py-2.5 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] border border-[#8F0D03] font-bold text-xs shadow-md shadow-[#B81104]/20 transition-all inline-flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Go to Curriculum Upload
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <AppHeader activePage="results" />
      <StepProgress currentStep={4} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 space-y-6">
        {/* Toast Notification */}
        {successToast && (
          <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white px-5 py-3 rounded-md shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-3 duration-200">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Header Bar */}
        <div className="bg-[#FFFFFF] border border-[#EAE5D9] rounded-lg p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8F0D03] bg-[#FFFACD] px-2.5 py-0.5 rounded border border-[#F4E88C]">
                  {assessmentPayload?.assessment_type?.toUpperCase() || "STANDARD"} ASSESSMENT
                </span>
                <span className="text-xs text-stone-300">•</span>
                <span className="text-xs text-stone-500 font-bold">
                  {questions.length} Items Total
                </span>
                {assessmentPayload?.provider && (
                  <>
                    <span className="text-xs text-stone-300">•</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      <span>AI: {assessmentPayload.provider} {assessmentPayload.model ? `(${assessmentPayload.model})` : ""}</span>
                    </span>
                  </>
                )}
              </div>

              {isEditingTitle ? (
                <div className="flex items-center gap-2 mt-2 mb-2 max-w-xl">
                  <span className="text-xs font-black uppercase tracking-wider text-[#8F0D03] bg-[#FFFACD] border border-[#F4E88C] px-2.5 py-1 rounded-md shrink-0">
                    Chapter Name:
                  </span>
                  <input
                    type="text"
                    value={editableChapterName}
                    onChange={(e) => setEditableChapterName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="flex-1 px-3 py-1.5 text-sm sm:text-base font-black text-stone-900 border border-[#B81104] rounded-md focus:outline-none focus:ring-2 focus:ring-[#B81104]/10 bg-white"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveTitle}
                    className="px-3 py-1.5 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-bold cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fallback = cleanTitle(assessmentPayload?.chapter_name || "");
                      setEditableChapterName(fallback);
                      setIsEditingTitle(false);
                    }}
                    className="px-2.5 py-1.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-[#8F0D03] bg-[#FFFACD] border border-[#F4E88C] px-2.5 py-1 rounded-md shrink-0">
                    Chapter Name:
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                    {editableChapterName || cleanTitle(chapterName) || "Curriculum Assessment"}
                  </h1>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    title="Edit Chapter Name"
                    className="p-1.5 rounded-lg text-stone-400 hover:text-[#B81104] hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}

              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed max-w-2xl">
                Official Examination Workbench. Review generated items, modify options inline,
                toggle answer keys, or export to publication-ready PDF.
              </p>
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Toggle Student / Instructor Mode */}
              <button
                type="button"
                onClick={() => setShowAnswers(!showAnswers)}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-md text-xs font-bold border transition-all cursor-pointer ${
                  showAnswers
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs"
                    : "bg-white text-stone-700 border-[#EAE5D9] hover:bg-stone-50"
                }`}
              >
                {showAnswers ? (
                  <>
                    <Eye className="w-4 h-4 text-emerald-600" />
                    <span>Instructor Mode (Answers On)</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4 text-stone-400" />
                    <span>Student Exam Mode</span>
                  </>
                )}
              </button>

              {/* Export PDF */}
              <button
                type="button"
                disabled={isExporting || questions.length === 0}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] border border-[#8F0D03] text-xs font-black shadow-md shadow-[#B81104]/20 hover:shadow-lg transition-all cursor-pointer disabled:bg-stone-300 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#FFFACD] border-t-transparent rounded-full animate-spin" />
                    <span>Generating ReportLab PDF...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" />
                    <span>Export Official PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-6 mt-6 border-t border-[#EAE5D9]">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              {[
                { id: "ALL", label: `All (${questions.length})` },
                { id: "Component Identification & Functions", label: "Component ID" },
                { id: "Number of Pins & Pin Identification", label: "Pinout Roles" },
                { id: "Hypothetical Scenario-Based Practical Reasoning", label: "Scenarios" },
                { id: "Logical & Conceptual Reasoning", label: "Logical Reasoning" },
                { id: "mcq", label: "MCQs" },
                { id: "situation", label: "Situational" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterType(f.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    filterType === f.id
                      ? "bg-[#B81104] text-[#FFFACD] shadow-xs border border-[#8F0D03]"
                      : "bg-[#FBF9F5] text-stone-600 hover:bg-stone-200 border border-[#EAE5D9]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddQuestion}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-dashed border-[#B81104]/50 text-[#8F0D03] hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Question</span>
            </button>
          </div>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-3 shadow-2xs">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Question Cards Stack */}
        {filteredQuestions.length === 0 ? (
          <div className="bg-[#FFFFFF] border border-[#EAE5D9] rounded-lg p-12 text-center shadow-xs">
            <h3 className="text-base font-bold text-stone-800 mb-1">
              No questions matching this filter
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Switch back to &apos;All&apos; or add a custom question above.
            </p>
            <button
              onClick={() => setFilterType("ALL")}
              className="text-xs text-[#B81104] font-bold hover:underline cursor-pointer"
            >
              Reset filter
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredQuestions.map((q, idx) => (
              <QuestionCard
                key={idx}
                index={idx}
                question={q}
                showAnswers={showAnswers}
                onUpdate={(updated) => updateQuestion(idx, updated)}
                onDelete={() => deleteQuestion(idx)}
                onDuplicate={() => handleDuplicateQuestion(idx)}
              />
            ))}
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between bg-white border border-[#EAE5D9] p-4 sm:p-5 rounded-lg shadow-xs">
          <button
            type="button"
            onClick={() => router.push("/configure")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-[#EAE5D9] bg-white text-stone-700 text-xs font-bold hover:bg-stone-50 transition-all shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Reconfigure Blueprint</span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/ingest")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-[#EAE5D9] bg-white text-stone-700 text-xs font-bold hover:bg-stone-50 transition-all shadow-2xs cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>New Assessment Session</span>
          </button>
        </div>
      </main>
    </div>
  );
}
