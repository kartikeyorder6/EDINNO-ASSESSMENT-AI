"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "../../lib/store";
import { generateAssessment, generateMergedAssessmentPaper } from "../../lib/api";
import {
  Sparkles,
  ShieldCheck,
  CheckCircle,
  HelpCircle,
  Layers,
  ArrowRight,
  ArrowLeft,
  Sliders,
  AlertCircle,
  Zap,
  Check,
  Cpu,
  Globe,
  Server,
  Scale,
  ChevronDown,
  Info,
} from "lucide-react";

export default function ConfigurePage() {
  const router = useRouter();
  const { extractedResources, activeChapterName, setAssessmentPayload } = useAssessment();

  const [assessmentType, setAssessmentType] = useState<string>("merged_conceptual");
  const [selectedSource, setSelectedSource] = useState<string>("ALL");
  const [questionCount, setQuestionCount] = useState<number>(12);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [selectedProvider, setSelectedProvider] = useState<string>("auto");
  const [showGuardrailsDetails, setShowGuardrailsDetails] = useState<boolean>(false);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resourceKeys = Object.keys(extractedResources);

  const blueprints = [
    {
      id: "merged_conceptual",
      title: "Merged Curriculum Assessment",
      subtitle: "Pinouts, Components & Scenario Reasoning",
      desc: "Flagship exam: pin identification, roles, practical scenarios, and conceptual logic. Strictly zero code and schematics.",
      tag: "Flagship • Strict Guardrails",
      recommended: true,
      icon: Sparkles,
      iconColor: "text-blue-600 bg-blue-50 border-blue-200",
    },
    {
      id: "pre_assembly",
      title: "Pre-Assembly Safety Check",
      subtitle: "Component ratings & hazard verification",
      desc: "5 rapid objective checks on breadboard limits, ratings, and pin safety before touching hardware.",
      tag: "Lab Safety",
      icon: ShieldCheck,
      iconColor: "text-amber-600 bg-amber-50 border-amber-200",
    },
    {
      id: "mixed",
      title: "Comprehensive Mixed Exam",
      subtitle: "20 Questions: 10 MCQs + 5 T/F + 5 Scenarios",
      desc: "Structured exam featuring 10 component & pinout MCQs, 5 conceptual True/False checks, and 5 scenario-based practical MCQs.",
      tag: "10 MCQ • 5 T/F • 5 Scenarios",
      icon: Layers,
      iconColor: "text-indigo-600 bg-indigo-50 border-indigo-200",
    },
    {
      id: "mcq",
      title: "Standardized Multiple Choice (MCQ)",
      subtitle: "4-option questions with detailed rationale",
      desc: "Single-correct answer questions with plausible distractors and curriculum references.",
      tag: "Objective Exam",
      icon: CheckCircle,
      iconColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
    },
    {
      id: "true_false",
      title: "Conceptual True / False Diagnostic",
      subtitle: "Hardware misconceptions & logic thresholds",
      desc: "Pinpoints subtle logic misunderstandings in pull-up resistors, digital thresholds, and ADC values.",
      tag: "Diagnostic",
      icon: HelpCircle,
      iconColor: "text-purple-600 bg-purple-50 border-purple-200",
    },
    {
      id: "master_all",
      title: "Master Cross-Modular Capstone",
      subtitle: "Cross-modular integration assessment",
      desc: "Tests cross-discipline synergy between controllers, sensors, actuators, and domain projects.",
      tag: "Capstone",
      icon: Scale,
      iconColor: "text-slate-700 bg-slate-100 border-slate-200",
    },
  ];

  const aiProviders = [
    { id: "auto", name: "Auto Smart Cascade (Recommended)" },
    { id: "gemini", name: "Google Gemini 3.6 Flash" },
    { id: "groq", name: "Groq LPU Acceleration" },
    { id: "openrouter", name: "OpenRouter Cloud" },
    { id: "ollama", name: "Local Offline Ollama" },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMsg(null);

    let contentToUse = "";
    let chapterNameToUse = activeChapterName;

    if (selectedSource === "ALL") {
      contentToUse = Object.entries(extractedResources)
        .map(([k, text]) => `=== MODULE: ${k} ===\n${text}`)
        .join("\n\n");
    } else {
      contentToUse = extractedResources[selectedSource] || "";
      chapterNameToUse = selectedSource;
    }

    if (!contentToUse.trim()) {
      setErrorMsg("No curriculum content loaded. Please return to Step 1 to upload documents.");
      setIsGenerating(false);
      return;
    }

    try {
      let resp;
      if (assessmentType === "merged_conceptual") {
        resp = await generateMergedAssessmentPaper({
          chapterContent: contentToUse,
          questionCount,
          difficulty,
          provider: selectedProvider,
        });
      } else {
        resp = await generateAssessment(
          contentToUse,
          assessmentType,
          questionCount,
          difficulty,
          selectedProvider
        );
      }

      setAssessmentPayload({
        assessment_type: assessmentType,
        chapter_name: resp.chapter_name || chapterNameToUse,
        difficulty,
        provider: resp.metadata?.provider || selectedProvider,
        model: resp.metadata?.model || "Standard",
        questions: resp.questions || [],
      });

      router.push("/results");
    } catch (e: any) {
      setErrorMsg(
        e.message || "Failed to generate assessment. Please check that the backend server is running."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedBlueprintObj = blueprints.find((b) => b.id === assessmentType) || blueprints[0];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      {/* SaaS Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EAE5D9]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200/80 text-[11px] font-bold text-blue-700 mb-1.5">
            <Sliders className="w-3 h-3" />
            <span>Step 3 of 4 • Blueprint Architecture</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Configure Assessment Blueprint
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Select an examination pattern and calibrate parameters before AI question generation.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <span className="text-xs text-slate-500 font-medium">Curriculum:</span>
          <span className="px-3 py-1 rounded-lg bg-white border border-[#EAE5D9] text-slate-800 text-xs font-bold shadow-2xs">
            {resourceKeys.length} {resourceKeys.length === 1 ? "Module" : "Modules"} Staged
          </span>
        </div>
      </div>

      {/* Sleek Minimal Guardrails Banner (Collapsible) */}
      <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3 sm:p-3.5 transition-all shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Active Guardrails
            </span>
            <span className="text-emerald-950 font-semibold text-xs">
              Component Pinouts & Scenario Logic Enforced
            </span>
            <span className="text-emerald-300 hidden sm:inline">•</span>
            <span className="text-emerald-700 text-xs hidden md:inline">
              Zero Code Snippets • Zero Circuit Schematics
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowGuardrailsDetails(!showGuardrailsDetails)}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 shrink-0 self-end sm:self-auto cursor-pointer"
          >
            <span>{showGuardrailsDetails ? "Hide Rules" : "View Rules"}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showGuardrailsDetails ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {showGuardrailsDetails && (
          <div className="mt-3 pt-3 border-t border-emerald-200/60 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs animate-in fade-in duration-200">
            <div className="bg-white/90 p-3 rounded-lg border border-emerald-100 shadow-2xs">
              <span className="font-bold text-emerald-900 block mb-1.5 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Must Include:
              </span>
              <ul className="space-y-1 text-emerald-800 text-[11px] leading-relaxed">
                <li>• Electronic component identification, functions & practical applications</li>
                <li>• Pin count and pin identification of relevant microcontrollers and sensors</li>
                <li>• Hypothetical, scenario-based questions testing practical understanding</li>
                <li>• Conceptual reasoning (pull-ups, time-of-flight, ADC resolution, diodes)</li>
              </ul>
            </div>

            <div className="bg-white/90 p-3 rounded-lg border border-red-100 shadow-2xs">
              <span className="font-bold text-red-900 block mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                Must Exclude:
              </span>
              <ul className="space-y-1 text-red-800 text-[11px] leading-relaxed">
                <li>• Coding questions (zero code snippets, setup/loop, digitalWrite)</li>
                <li>• Circuit-based questions, wiring diagrams or schematics</li>
                <li>• Arbitrary project-specific pin configurations or project trivia</li>
                <li>• Duplicates or repetitive cognitive items</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* 1. SELECT ASSESSMENT BLUEPRINT */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            1. Select Assessment Architecture
          </h2>
          <span className="text-xs text-slate-400">
            {blueprints.length} Options Available
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {blueprints.map((b) => {
            const Icon = b.icon;
            const isSelected = assessmentType === b.id;

            return (
              <div
                key={b.id}
                onClick={() => {
                  setAssessmentType(b.id);
                  if (b.id === "mixed") {
                    setQuestionCount(20);
                  } else if (b.id === "pre_assembly") {
                    setQuestionCount(5);
                  } else if (b.id === "merged_conceptual") {
                    setQuestionCount(12);
                  }
                }}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? "border-blue-600 bg-white shadow-sm ring-3 ring-blue-500/10"
                    : "border-[#EAE5D9] bg-white hover:border-slate-300 shadow-2xs hover:shadow-xs"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${b.iconColor}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-xs sm:text-sm leading-tight">
                          {b.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {b.subtitle}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-2 mb-3">
                    {b.desc}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                  <span className="px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-700">
                    {b.tag}
                  </span>
                  {b.recommended && (
                    <span className="font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9px] tracking-wider">
                      Recommended
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. GENERATION PARAMETERS (Unified Modern Grid) */}
      <div className="bg-white border border-[#EAE5D9] rounded-2xl p-4 sm:p-5 shadow-xs">
        <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
          2. Synthesis Parameters & Scope
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Parameter 1: Scope */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Target Scope
            </label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full text-xs font-medium text-slate-800 p-2.5 bg-[#FBF9F5] border border-[#EAE5D9] rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="ALL">Entire Aggregated Chapter ({resourceKeys.length} modules)</option>
              {resourceKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Cross-curriculum or single document</p>
          </div>

          {/* Parameter 2: Question Count */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Question Count</label>
              <span className="text-xs font-bold text-blue-700 px-2 py-0.2 rounded-full bg-blue-50 border border-blue-200">
                {questionCount} Qs
              </span>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              {[5, 8, 10, 12, 15, 20].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setQuestionCount(cnt)}
                  className={`flex-1 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    questionCount === cnt
                      ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                      : "bg-[#FBF9F5] text-slate-600 border-[#EAE5D9] hover:bg-slate-100"
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              {assessmentType === "mixed"
                ? "Mixed exam: 10 MCQs + 5 T/F + 5 Scenarios"
                : "Target length for question paper"}
            </p>
          </div>

          {/* Parameter 3: Cognitive Difficulty */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Cognitive Difficulty
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#FBF9F5] border border-[#EAE5D9] rounded-xl">
              {[
                { id: "easy", label: "Beginner" },
                { id: "medium", label: "Standard" },
                { id: "hard", label: "Advanced" },
              ].map((diff) => (
                <button
                  key={diff.id}
                  type="button"
                  onClick={() => setDifficulty(diff.id)}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    difficulty === diff.id
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {diff.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Calibrates scenario depth</p>
          </div>

          {/* Parameter 4: AI Model Provider */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              AI Synthesis Engine
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full text-xs font-medium text-slate-800 p-2.5 bg-[#FBF9F5] border border-[#EAE5D9] rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
            >
              {aiProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Fault-tolerant cascade with fallback</p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Bottom Sticky Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-[#EAE5D9] p-4 rounded-2xl shadow-xs">
        <button
          type="button"
          onClick={() => router.push("/merge")}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#EAE5D9] bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Review</span>
        </button>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {/* Summary capsule */}
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{selectedBlueprintObj.title}</span>
            <span>•</span>
            <span className="font-semibold text-blue-700">{questionCount} Questions</span>
            <span>•</span>
            <span className="capitalize">{difficulty}</span>
          </div>

          <button
            type="button"
            disabled={isGenerating}
            onClick={handleGenerate}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white transition-all shadow-xs ${
              isGenerating
                ? "bg-blue-400 cursor-wait"
                : "bg-blue-600 hover:bg-blue-700 hover:shadow-md cursor-pointer"
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Synthesizing Assessment...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Generate Assessment</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
