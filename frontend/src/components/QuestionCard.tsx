"use client";

import React, { useState } from "react";
import { QuestionItem } from "../types";
import { Trash2, Copy, CheckCircle2, HelpCircle } from "lucide-react";

interface QuestionCardProps {
  index: number;
  question: QuestionItem;
  showAnswers: boolean;
  onUpdate: (updated: QuestionItem) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export default function QuestionCard({
  index,
  question,
  showAnswers,
  onUpdate,
  onDelete,
  onDuplicate,
}: QuestionCardProps) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    mcq: { label: "Multiple Choice", color: "bg-blue-50 text-blue-700 border-blue-200" },
    true_false: { label: "True / False", color: "bg-purple-50 text-purple-700 border-purple-200" },
    general: { label: "Short Answer", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    situation: { label: "Scenario Based", color: "bg-amber-50 text-amber-700 border-amber-200" },
    matching: { label: "Matching", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  };

  const badge = typeLabels[question.type] || {
    label: question.type.toUpperCase(),
    color: "bg-slate-50 text-slate-700 border-slate-200",
  };

  const handleTextChange = (field: keyof QuestionItem, val: any) => {
    onUpdate({ ...question, [field]: val });
  };

  const handleOptionChange = (key: string, val: string) => {
    if (typeof question.options === "object" && !Array.isArray(question.options)) {
      const newOpts = { ...question.options, [key]: val };
      onUpdate({ ...question, options: newOpts });
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#EAE5D9] rounded-2xl p-6 shadow-xs hover:border-blue-300 transition-all">
      {/* Top Bar */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-900 text-xs bg-[#FBF9F5] border border-[#EAE5D9] px-2.5 py-1 rounded-lg">
            Q{index + 1}
          </span>
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badge.color}`}>
            {badge.label}
          </span>
          {question.category && (
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {question.category}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-slate-400">
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate Question"
            className="p-1.5 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete Question"
            className="p-1.5 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scenario if present */}
      {question.scenario && (
        <div className="mb-4 p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 italic">
          <span className="font-bold not-italic">Scenario: </span>
          {question.scenario}
        </div>
      )}

      {/* Question Text */}
      <div className="mb-4">
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
          Question Text
        </label>
        <textarea
          value={question.question}
          onChange={(e) => handleTextChange("question", e.target.value)}
          rows={2}
          className="w-full text-sm font-semibold text-slate-900 p-3 bg-[#FBF9F5] border border-[#EAE5D9] rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all leading-relaxed"
        />
      </div>

      {/* Options for MCQ */}
      {question.type === "mcq" && question.options && typeof question.options === "object" && (
        <div className="mb-4 space-y-2">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Answer Options (Click letter to set correct key)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {Object.entries(question.options).map(([optKey, optVal]) => {
              const isCorrect =
                question.answer?.toUpperCase() === optKey.toUpperCase() ||
                question.answer === optVal;

              return (
                <div
                  key={optKey}
                  className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all ${
                    showAnswers && isCorrect
                      ? "bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-400/50"
                      : "bg-[#FBF9F5] border-[#EAE5D9] hover:border-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleTextChange("answer", optKey)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                      isCorrect
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    }`}
                  >
                    {optKey}
                  </button>
                  <input
                    type="text"
                    value={optVal}
                    onChange={(e) => handleOptionChange(optKey, e.target.value)}
                    className="flex-1 text-xs text-slate-800 bg-transparent focus:outline-none font-medium"
                  />
                  {showAnswers && isCorrect && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* True / False format */}
      {question.type === "true_false" && (
        <div className="mb-4">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
            Correct Truth Value
          </label>
          <div className="flex gap-2.5">
            {["True", "False"].map((choice) => {
              const isSelected =
                (question.answer || "").toLowerCase() === choice.toLowerCase() ||
                (choice === "True" && (question.answer || "").toUpperCase() === "A") ||
                (choice === "False" && (question.answer || "").toUpperCase() === "B");
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => handleTextChange("answer", choice === "True" ? "A" : "B")}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    isSelected
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                      : "bg-white text-slate-700 border-[#EAE5D9] hover:bg-slate-50"
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
        <div className="mb-4">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Expected Answer Key
          </label>
          <input
            type="text"
            value={question.answer}
            onChange={(e) => handleTextChange("answer", e.target.value)}
            className="w-full text-xs font-medium text-slate-800 p-2.5 bg-[#FBF9F5] border border-[#EAE5D9] rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>
      )}

      {/* Explanation & Rationale */}
      {showAnswers && (
        <div className="pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-600">
          <HelpCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-slate-700">Grading Explanation & Notes: </span>
            <input
              type="text"
              value={question.explanation || ""}
              placeholder="Add grading rationale..."
              onChange={(e) => handleTextChange("explanation", e.target.value)}
              className="w-full bg-transparent border-b border-dashed border-slate-300 text-xs text-slate-700 focus:outline-none focus:border-blue-500 mt-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
