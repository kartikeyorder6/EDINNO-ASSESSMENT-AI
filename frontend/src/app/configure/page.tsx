"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "../../lib/store";
import { generateAssessment, generateMergedAssessmentPaper } from "../../lib/api";
import { BLUEPRINT_TOKENS } from "../../lib/design-tokens";
import { BlueprintCard, SelectDropdown } from "../../components/ui";
import { AppHeader } from "../../components/layout/AppHeader";
import StepProgress from "../../components/StepProgress";
import {
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Sliders,
  AlertCircle,
  Zap,
  Check,
  ChevronDown,
} from "lucide-react";

export default function ConfigurePage() {
  const router = useRouter();
  const { extractedResources, activeChapterName, setAssessmentPayload } = useAssessment();

  const [assessmentType, setAssessmentType] = useState<string>("mixed");
  const [selectedSource, setSelectedSource] = useState<string>("ALL");
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [selectedProvider, setSelectedProvider] = useState<string>("gemini");
  const [showGuardrailsDetails, setShowGuardrailsDetails] = useState<boolean>(false);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resourceKeys = Object.keys(extractedResources);

  const aiProviders = [
    { id: "gemini", name: "Google Gemini 3.6 Flash (Flagship)" },
    { id: "auto", name: "Auto Smart Cascade (Recommended)" },
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
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErrorMsg(
        err.message || "Failed to generate assessment. Please check that the backend server is running."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedBlueprintObj =
    BLUEPRINT_TOKENS.find((b) => b.id === assessmentType) || BLUEPRINT_TOKENS[0];

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <AppHeader activePage="configure" />
      <StepProgress currentStep={3} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 space-y-6">
        {/* Header Ribbon Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EAE5D9]">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#FFFACD] border border-[#F4E88C] text-[11px] font-bold text-[#8F0D03] mb-1.5">
              <Sliders className="w-3 h-3" />
              <span>Step 3 of 4 • Blueprint Architecture</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
              Configure Assessment Blueprint
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
              Select an examination pattern and calibrate parameters before AI question generation.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <span className="text-xs text-stone-500 font-medium">Curriculum:</span>
            <span className="px-3 py-1 rounded-md bg-white border border-[#EAE5D9] text-stone-800 text-xs font-bold shadow-2xs">
              {resourceKeys.length} {resourceKeys.length === 1 ? "Module" : "Modules"} Staged
            </span>
          </div>
        </div>

        {/* Minimal Guardrails Banner (Collapsible) */}
        <div className="rounded-lg border border-emerald-200/90 bg-emerald-50/50 p-3.5 sm:p-4 transition-all shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Active Guardrails
              </span>
              <span className="text-emerald-950 font-bold text-xs">
                Component Pinouts &amp; Scenario Logic Enforced
              </span>
              <span className="text-emerald-300 hidden sm:inline">•</span>
              <span className="text-emerald-700 text-xs hidden md:inline">
                Zero Code Snippets • Zero Circuit Schematics
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowGuardrailsDetails(!showGuardrailsDetails)}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 shrink-0 self-end sm:self-auto cursor-pointer"
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
            <div className="mt-3.5 pt-3.5 border-t border-emerald-200/60 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs animate-in fade-in duration-200">
              <div className="bg-white/95 p-3.5 rounded-md border border-emerald-100 shadow-2xs">
                <span className="font-bold text-emerald-900 block mb-1.5 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Must Include:
                </span>
                <ul className="space-y-1 text-emerald-800 text-[11px] leading-relaxed">
                  <li>• Electronic component identification, functions &amp; practical applications</li>
                  <li>• Pin count and pin identification of relevant microcontrollers and sensors</li>
                  <li>• Hypothetical, scenario-based questions testing practical understanding</li>
                  <li>• Conceptual reasoning (pull-ups, time-of-flight, ADC resolution, diodes)</li>
                </ul>
              </div>

              <div className="bg-white/95 p-3.5 rounded-md border border-red-100 shadow-2xs">
                <span className="font-bold text-red-900 block mb-1.5 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                  Must Exclude:
                </span>
                <ul className="space-y-1 text-red-800 text-[11px] leading-relaxed">
                  <li>• Coding questions (zero code snippets, setup/loop, digitalWrite)</li>
                  <li>• Circuit schematics or diagram synthesis</li>
                  <li>• Syntax memorization or boilerplate questions</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* 1. SELECT ASSESSMENT BLUEPRINT */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-stone-800 uppercase tracking-wider">
              1. Select Assessment Architecture
            </h2>
            <span className="text-xs text-stone-400 font-medium">
              {BLUEPRINT_TOKENS.length} Options Available
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {BLUEPRINT_TOKENS.map((blueprint) => (
              <BlueprintCard
                key={blueprint.id}
                blueprint={blueprint}
                isSelected={assessmentType === blueprint.id}
                onSelect={(id, defaultCount) => {
                  setAssessmentType(id);
                  if (defaultCount) setQuestionCount(defaultCount);
                }}
              />
            ))}
          </div>
        </section>

        {/* 2. GENERATION PARAMETERS (Unified Modern Grid) */}
        <section className="bg-white border border-[#EAE5D9] rounded-lg p-5 sm:p-6 shadow-xs space-y-4">
          <h2 className="text-xs font-black text-stone-800 uppercase tracking-wider">
            2. Synthesis Parameters &amp; Scope
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Parameter 1: Scope */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Target Scope
              </label>
              <SelectDropdown
                size="sm"
                value={selectedSource}
                onChange={(val) => setSelectedSource(val)}
                options={[
                  { value: "ALL", label: `Entire Aggregated Chapter (${resourceKeys.length} modules)` },
                  ...resourceKeys.map((key) => ({ value: key, label: key })),
                ]}
              />
              <p className="text-[11px] text-stone-400 mt-1">Cross-curriculum or single document</p>
            </div>

            {/* Parameter 2: Question Count */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-stone-700">Question Count</label>
                <span className="text-xs font-bold text-[#8F0D03] px-2 py-0.5 rounded bg-[#FFFACD] border border-[#F4E88C]">
                  {questionCount} Qs
                </span>
              </div>
              <div className="flex items-center gap-1 mb-1.5">
                {[5, 8, 10, 12, 15, 20].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setQuestionCount(cnt)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md border transition-all cursor-pointer ${
                      questionCount === cnt
                        ? "bg-[#B81104] text-[#FFFACD] border-[#8F0D03] shadow-xs"
                        : "bg-[#FBF9F5] text-stone-600 border-[#EAE5D9] hover:bg-stone-100"
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-stone-400">
                {assessmentType === "mixed"
                  ? "Mixed exam: 5 MCQs + 3 T/F + 2 Scenarios"
                  : "Target length for question paper"}
              </p>
            </div>

            {/* Parameter 3: Cognitive Difficulty */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Cognitive Difficulty
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#FBF9F5] border border-[#EAE5D9] rounded-md">
                {[
                  { id: "easy", label: "Beginner" },
                  { id: "medium", label: "Standard" },
                  { id: "hard", label: "Advanced" },
                ].map((diff) => (
                  <button
                    key={diff.id}
                    type="button"
                    onClick={() => setDifficulty(diff.id)}
                    className={`py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${
                      difficulty === diff.id
                        ? "bg-[#B81104] text-[#FFFACD] shadow-xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    {diff.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-stone-400 mt-1">Calibrates scenario depth</p>
            </div>

            {/* Parameter 4: AI Model Provider */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                AI Synthesis Engine
              </label>
              <SelectDropdown
                size="sm"
                value={selectedProvider}
                onChange={(val) => setSelectedProvider(val)}
                options={aiProviders.map((p) => ({ value: p.id, label: p.name }))}
              />
              <p className="text-[11px] text-stone-400 mt-1">Fault-tolerant cascade with fallback</p>
            </div>
          </div>
        </section>

        {/* Error banner */}
        {errorMsg && (
          <div className="p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2.5 shadow-2xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Bottom Sticky Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-[#EAE5D9] p-4 sm:p-5 rounded-lg shadow-xs">
          <button
            type="button"
            onClick={() => router.push("/merge")}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-[#EAE5D9] bg-white text-stone-700 text-xs font-bold hover:bg-stone-50 transition-all shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Review</span>
          </button>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {/* Summary capsule */}
            <div className="hidden md:flex items-center gap-2 text-xs text-stone-500">
              <span className="font-semibold text-stone-800">{selectedBlueprintObj.title}</span>
              <span>•</span>
              <span className="font-bold text-[#8F0D03]">{questionCount} Questions</span>
              <span>•</span>
              <span className="capitalize">{difficulty}</span>
            </div>

            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGenerate}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-md text-xs sm:text-sm font-black transition-all shadow-md cursor-pointer ${
                isGenerating
                  ? "bg-[#B81104]/70 text-[#FFFACD] cursor-wait"
                  : "bg-[#B81104] hover:bg-[#8F0D03] active:bg-[#720B02] text-[#FFFACD] border border-[#8F0D03] shadow-[#B81104]/25 hover:shadow-lg"
              }`}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#FFFACD] border-t-transparent rounded-full animate-spin" />
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
      </main>
    </div>
  );
}
