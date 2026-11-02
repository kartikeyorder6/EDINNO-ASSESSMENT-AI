"use client";

import React, { useMemo } from "react";
import { QuestionItem } from "../types";
import { Trash2, Copy, CheckCircle2, HelpCircle } from "lucide-react";
import { QuestionTypeBadge } from "./ui/QuestionTypeBadge";

interface QuestionCardProps {
  index: number;
  question: QuestionItem;
  showAnswers: boolean;
  onUpdate: (updated: QuestionItem) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function QuestionCardComponent({
  index,
  question,
  showAnswers,
  onUpdate,
  onDelete,
  onDuplicate,
}: QuestionCardProps) {
  const handleTextChange = (field: keyof QuestionItem, val: QuestionItem[keyof QuestionItem]) => {
    onUpdate({ ...question, [field]: val });
  };

  // Robust normalization of options whether passed as Record<string, string> or string[]
  const normalizedOptions: Record<string, string> = useMemo(() => {
    if (!question.options) return {};
    if (Array.isArray(question.options)) {
      const dict: Record<string, string> = {};
      const letters = ["A", "B", "C", "D", "E", "F"];
      question.options.forEach((opt, idx) => {
        const letter = letters[idx] || String(idx + 1);
        const cleaned = opt.replace(/^[A-F][\)\.]\s*/i, "");
        dict[letter] = cleaned;
      });
      return dict;
    }
    return question.options;
  }, [question.options]);

  const handleOptionChange = (key: string, val: string) => {
    const newOpts = { ...normalizedOptions, [key]: val };
    onUpdate({ ...question, options: newOpts });
  };

  return (
    <div className="bg-white border border-[#EAE5D9] rounded-lg p-4 sm:p-5 shadow-xs hover:border-stone-300 transition-all card-interactive print:border-slate-300 print:shadow-none print:break-inside-avoid print:p-4 print:mb-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-100 print:pb-2 print:mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-stone-900 text-xs bg-[#FFFACD] border border-[#F4E88C] text-[#8F0D03] px-2 py-0.5 rounded tabular-nums">
            Q{index + 1}
          </span>
          <QuestionTypeBadge type={question.type} />
          {question.category && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
              {question.category}
            </span>
          )}
          {question.marks !== undefined && question.marks > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              {question.marks} {question.marks === 1 ? "Mark" : "Marks"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-stone-400 print:hidden">
          <button
            type="button"
            onClick={onDuplicate}
            aria-label={`Duplicate Question ${index + 1}`}
            title="Duplicate Question"
            className="p-1.5 flex items-center justify-center hover:text-[#B81104] hover:bg-red-50 rounded-md transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete Question ${index + 1}`}
            title="Delete Question"
            className="p-1.5 flex items-center justify-center hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scenario if present */}
      {question.scenario && (
        <div className="mb-3.5 p-3 bg-amber-50/70 border border-amber-200 rounded-md text-xs text-amber-900">
          <span className="font-bold block mb-0.5 uppercase tracking-wider text-[10px] text-amber-800">
            Scenario:
          </span>
          <p className="font-medium leading-relaxed">{question.scenario}</p>
        </div>
      )}

      {/* Question Text */}
      <div className="mb-3.5">
        <label
          htmlFor={`q-text-${index}`}
          className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1 print:text-black"
        >
          Question Text
        </label>
        <textarea
          id={`q-text-${index}`}
          aria-label={`Question ${index + 1} text`}
          value={question.question}
          onChange={(e) => handleTextChange("question", e.target.value)}
          rows={2}
          className="w-full text-xs sm:text-sm font-semibold text-stone-900 p-2.5 bg-[#FDFBF7] border border-stone-200 rounded-md focus:outline-none focus:border-[#B81104] focus:ring-1 focus:ring-[#B81104]/20 focus:bg-white transition-all leading-relaxed print:bg-white print:border-none print:p-0"
        />
      </div>

      {/* Component Reference Diagram if present */}
      {question.image_data && (
        <div className="mb-3.5 p-3 bg-stone-50 border border-stone-200 rounded-md print:border-slate-300 print:bg-white print:p-1">
          <div className="flex items-center justify-between mb-2 print:mb-1">
            <span className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex items-center gap-1.5 print:text-black">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B81104] inline-block print:hidden" />
              Reference Diagram
            </span>
            {question.image_caption && (
              <span className="text-xs text-stone-500 italic max-w-[70%] truncate print:text-black">
                {question.image_caption}
              </span>
            )}
          </div>
          <div className="flex justify-center bg-white rounded-md p-2 border border-stone-200 print:border-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={question.image_data}
              alt={question.image_caption || `Question ${index + 1} reference diagram`}
              loading="lazy"
              decoding="async"
              className="max-h-56 max-w-full object-contain rounded"
            />
          </div>
        </div>
      )}

      {/* Options for MCQ / situation */}
      {(question.type === "mcq" || question.type === "situation" || Object.keys(normalizedOptions).length > 0) && (
        <div className="mb-3.5 space-y-1.5">
          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1 print:text-black">
            Answer Options {showAnswers && "(Click letter to set correct key)"}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 print:grid-cols-2">
            {Object.entries(normalizedOptions).map(([optKey, optVal]) => {
              const isCorrect =
                question.answer?.toUpperCase() === optKey.toUpperCase() ||
                question.answer === optVal;

              return (
                <div
                  key={optKey}
                  className={`flex items-center gap-2 p-2 rounded-md border transition-all print:border-slate-300 print:bg-white ${
                    showAnswers && isCorrect
                      ? "bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-400/40 print:ring-0 print:border-slate-800"
                      : "bg-[#FDFBF7] border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`Select option ${optKey} as correct answer`}
                    onClick={() => handleTextChange("answer", optKey)}
                    className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold transition-all cursor-pointer print:border print:border-slate-800 ${
                      showAnswers && isCorrect
                        ? "bg-emerald-600 text-white shadow-xs print:bg-black print:text-white"
                        : "bg-stone-200 text-stone-700 hover:bg-stone-300 print:bg-white print:text-black"
                    }`}
                  >
                    {optKey}
                  </button>
                  <input
                    type="text"
                    aria-label={`Option ${optKey} text`}
                    value={optVal}
                    onChange={(e) => handleOptionChange(optKey, e.target.value)}
                    className="flex-1 text-xs text-stone-900 bg-transparent focus:outline-none font-medium print:text-black"
                  />
                  {showAnswers && isCorrect && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 print:hidden" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* True / False format */}
      {question.type === "true_false" && (
        <div className="mb-3.5">
          <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5 print:text-black">
            Truth Value
          </label>
          <div className="flex gap-2">
            {["True", "False"].map((choice) => {
              const isSelected =
                (question.answer || "").toLowerCase() === choice.toLowerCase() ||
                (choice === "True" && (question.answer || "").toUpperCase() === "A") ||
                (choice === "False" && (question.answer || "").toUpperCase() === "B");
              return (
                <button
                  key={choice}
                  type="button"
                  aria-label={`Select ${choice}`}
                  onClick={() => handleTextChange("answer", choice === "True" ? "A" : "B")}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-bold border transition-all cursor-pointer ${
                    showAnswers && isSelected
                      ? "bg-[#B81104] text-[#FFFACD] border-[#8F0D03] shadow-xs print:bg-black print:text-white"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50 print:border-slate-400 print:text-black"
                  }`}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Short Answer / General */}
      {question.type === "general" && (
        <div className="mb-3.5">
          {showAnswers ? (
            <>
              <label
                htmlFor={`q-ans-${index}`}
                className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1 print:text-black"
              >
                Expected Answer Key
              </label>
              <input
                id={`q-ans-${index}`}
                type="text"
                aria-label={`Question ${index + 1} Answer Key`}
                value={question.answer}
                onChange={(e) => handleTextChange("answer", e.target.value)}
                className="w-full text-xs font-medium text-stone-900 p-2.5 bg-[#FDFBF7] border border-stone-200 rounded-md focus:outline-none focus:border-[#B81104] focus:bg-white print:bg-white print:border-slate-300"
              />
            </>
          ) : (
            <div className="hidden print:block pt-3">
              <span className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider block mb-1">
                Student Response:
              </span>
              <div className="border-b border-dashed border-stone-400 h-10 w-full" />
            </div>
          )}
        </div>
      )}

      {/* Explanation & Rationale */}
      {showAnswers && (
        <div className="pt-3 border-t border-stone-100 flex items-start gap-2.5 text-xs text-stone-600 print:border-slate-300 print:text-black">
          <HelpCircle className="w-4 h-4 text-[#B81104] shrink-0 mt-0.5 print:hidden" />
          <div className="flex-1">
            <span className="font-bold text-stone-800 print:text-black">
              Grading Explanation &amp; Hardware Rationale:{" "}
            </span>
            <input
              type="text"
              aria-label={`Question ${index + 1} Grading Explanation`}
              value={question.explanation || ""}
              placeholder="Add pedagogical rationale..."
              onChange={(e) => handleTextChange("explanation", e.target.value)}
              className="w-full bg-transparent border-b border-dashed border-stone-300 text-xs text-stone-700 focus:outline-none focus:border-[#B81104] mt-1 print:border-none print:text-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}

const QuestionCard = React.memo(QuestionCardComponent);
export default QuestionCard;
