"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import QuestionCard from "../../components/QuestionCard";
import { useAssessment } from "../../lib/store";
import { downloadAssessmentPdf } from "../../lib/api";
import { QuestionItem } from "../../types";
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
  FileCheck2,
  Printer,
  Check,
  Ban,
  ShieldCheck,
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
  const [editableChapterName, setEditableChapterName] = useState<string>("");

  const questions = assessmentPayload?.questions || [];
  const chapterName = assessmentPayload?.chapter_name || "Curriculum Assessment";

  const cleanTitle = (str: string) => {
    return (str || "")
      .replace(/^chapter\s*(name)?\s*[:\-]\s*/i, "")
      .replace(/\s*[\(\[][\s\S]*?[\)\]]/g, "")
      .trim();
  };

  useEffect(() => {
    if (assessmentPayload?.chapter_name) {
      const stripped = cleanTitle(assessmentPayload.chapter_name);
      setEditableChapterName(stripped || assessmentPayload.chapter_name);
    }
  }, [assessmentPayload?.chapter_name]);

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
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to download assessment PDF.");
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-[#EAE5D9] rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">No Assessment Generated Yet</h2>
          <p className="text-xs sm:text-sm text-slate-500 mb-6 leading-relaxed">
            Upload curriculum PDF documents and generate questions to preview, edit, and download your assessment question paper.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all inline-flex items-center gap-2 shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" /> Go to Curriculum Upload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-[#FFFFFF] border border-[#EAE5D9] rounded-2xl p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                {assessmentPayload?.assessment_type?.toUpperCase() || "STANDARD"} ASSESSMENT
              </span>
              <span className="text-xs text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-semibold">
                {questions.length} Items Total
              </span>
              {assessmentPayload?.provider && (
                <>
                  <span className="text-xs text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>AI: {assessmentPayload.provider} {assessmentPayload.model ? `(${assessmentPayload.model})` : ""}</span>
                  </span>
                </>
              )}
            </div>
            {isEditingTitle ? (
              <div className="flex items-center gap-2 mt-2 mb-2 max-w-xl">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-md shrink-0">
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
                  className="flex-1 px-3 py-1.5 text-sm sm:text-base font-bold text-slate-900 border border-blue-400 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
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
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md shrink-0">
                  Chapter Name:
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {editableChapterName || cleanTitle(chapterName) || "Curriculum Assessment"}
                </h1>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  title="Edit Chapter Name"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-2xl">
              Official Merged Examination Workbench. Review generated items, modify options inline,
              toggle answer key confidentiality, or export to publication-ready ReportLab A4 PDF.
            </p>

            {/* Parameters Compliance Badge Bar */}
            <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Component Identification & Functions</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Pin Counts & Pinout Roles</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hypothetical Practical Scenarios</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Logical & Conceptual Reasoning</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold">
                <Ban className="w-3 h-3 text-red-500" />
                <span>Zero Code</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold">
                <Ban className="w-3 h-3 text-red-500" />
                <span>Zero Circuit Diagrams</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold">
                <Ban className="w-3 h-3 text-red-500" />
                <span>Zero Project-Specific Trivia</span>
              </span>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Toggle Student / Instructor Mode */}
            <button
              type="button"
              onClick={() => setShowAnswers(!showAnswers)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                showAnswers
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs"
                  : "bg-white text-slate-700 border-[#EAE5D9] hover:bg-slate-50"
              }`}
            >
              {showAnswers ? (
                <>
                  <Eye className="w-4 h-4 text-emerald-600" />
                  <span>Instructor Mode (Answers On)</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-slate-400" />
                  <span>Student Exam Mode</span>
                </>
              )}
            </button>

            {/* Export PDF */}
            <button
              type="button"
              disabled={isExporting || questions.length === 0}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer disabled:bg-slate-300"
            >
              {isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  filterType === f.id
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-[#FBF9F5] text-slate-600 hover:bg-slate-200 border border-[#EAE5D9]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddQuestion}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-blue-400 text-blue-700 hover:bg-blue-50 text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Question</span>
          </button>
        </div>
      </div>

      {/* Error notification */}
      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Question Cards Stack */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#EAE5D9] rounded-2xl p-12 text-center shadow-xs">
          <h3 className="text-base font-bold text-slate-800 mb-1">
            No questions matching this filter
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Switch back to &apos;All&apos; or add a custom question above.
          </p>
          <button
            onClick={() => setFilterType("ALL")}
            className="text-xs text-blue-600 font-bold hover:underline"
          >
            Reset filter
          </button>
        </div>
      ) : (
        <div className="space-y-4 mb-10">
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
      <div className="flex items-center justify-between bg-white border border-[#EAE5D9] p-4 rounded-2xl shadow-xs">
        <button
          type="button"
          onClick={() => router.push("/configure")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#EAE5D9] bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Reconfigure Blueprint</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#EAE5D9] bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all shadow-2xs"
        >
          <RotateCcw className="w-4 h-4" />
          <span>New Assessment Session</span>
        </button>
      </div>
    </div>
  );
}
