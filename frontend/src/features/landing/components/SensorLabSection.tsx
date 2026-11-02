"use client";

import React, { useState, useEffect, useRef } from "react";
import { Cpu, Zap, ShieldCheck, CheckCircle2, RotateCcw, AlertTriangle, Sparkles } from "lucide-react";
import { SENSOR_CATALOG, SensorDetail } from "../types";
import { generateAssessment } from "../../../lib/api";
import { QuestionItem } from "../../../types";

function parseOptions(opts?: Record<string, string> | string[]): Array<{ key: string; text: string }> {
  if (!opts) return [];
  if (Array.isArray(opts)) {
    return opts.map((text, i) => ({ key: String.fromCharCode(65 + i), text }));
  }
  return Object.entries(opts).map(([key, text]) => ({ key: key.toUpperCase(), text }));
}

export function SensorLabSection() {
  const [activeSensor, setActiveSensor] = useState<SensorDetail>(SENSOR_CATALOG[0]);
  const [cachedQuestions, setCachedQuestions] = useState<Record<string, QuestionItem>>({});
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [isInViewport, setIsInViewport] = useState<boolean>(false);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  // Lazy viewport activation: don't call AI until user scrolls near the sensor lab
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) {
      const id = setTimeout(() => setIsInViewport(true), 0);
      return () => clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsInViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const isLoadingQuestion = Boolean(
    isInViewport && !cachedQuestions[activeSensor.id] && !questionError
  );

  useEffect(() => {
    if (!isInViewport) return;
    if (cachedQuestions[activeSensor.id]) return;

    if (abortCtrlRef.current) abortCtrlRef.current.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    const sensorToLoad = activeSensor;
    let mounted = true;
    const curriculumText = `Hardware Component: ${sensorToLoad.name}\nCategory: ${sensorToLoad.category}\nPin Architecture: ${sensorToLoad.pins.join(", ")}\nWorking Physics & Principle: ${sensorToLoad.workingPrinciple}\nHardware Safety Rule: ${sensorToLoad.safetyRule}`;

    generateAssessment(
      curriculumText,
      "mcq",
      1,
      "medium",
      "auto",
      undefined,
      undefined,
      ctrl.signal
    )
      .then((resp) => {
        if (!mounted) return;
        const generated = resp.questions?.[0];
        if (generated) {
          setCachedQuestions((prev) => ({ ...prev, [sensorToLoad.id]: generated }));
        } else {
          setQuestionError("No diagnostic question could be synthesized.");
        }
      })
      .catch((err: unknown) => {
        if (!mounted || (err instanceof Error && err.name === "AbortError")) return;
        const e = err as { message?: string };
        setQuestionError(e?.message || "Failed to generate diagnostic question from AI engine.");
      });

    return () => {
      mounted = false;
      ctrl.abort();
    };
  }, [isInViewport, activeSensor, cachedQuestions]);

  const activeQuestion = cachedQuestions[activeSensor.id];
  const options = parseOptions(activeQuestion?.options);

  const isAnswerCorrect = (optKey: string, optText: string): boolean => {
    if (!activeQuestion) return false;
    const ans = (activeQuestion.answer || "").trim().toUpperCase();
    return ans === optKey.toUpperCase() || ans === optText.toUpperCase();
  };

  const selectedOpt = options.find((o) => o.key === selectedKey);
  const userGotItRight = selectedOpt ? isAnswerCorrect(selectedOpt.key, selectedOpt.text) : false;

  const handleSelectSensor = (sensor: SensorDetail) => {
    setActiveSensor(sensor);
    setSelectedKey(null);
    setIsSubmitted(false);
    setQuestionError(null);
  };

  const handleRetrySynthesis = () => {
    setQuestionError(null);
    const sensorToLoad = activeSensor;
    const curriculumText = `Hardware Component: ${sensorToLoad.name}\nCategory: ${sensorToLoad.category}\nPin Architecture: ${sensorToLoad.pins.join(", ")}\nWorking Physics & Principle: ${sensorToLoad.workingPrinciple}\nHardware Safety Rule: ${sensorToLoad.safetyRule}`;
    generateAssessment(
      curriculumText,
      "mcq",
      1,
      "medium",
      "auto"
    )
      .then((resp) => {
        const generated = resp.questions?.[0];
        if (generated) {
          setCachedQuestions((prev) => ({ ...prev, [sensorToLoad.id]: generated }));
        } else {
          setQuestionError("No diagnostic question could be synthesized.");
        }
      })
      .catch((err: unknown) => {
        const e = err as { message?: string };
        setQuestionError(e?.message || "Failed to generate diagnostic question from AI engine.");
      });
  };

  const handleSelectOption = (key: string) => {
    if (!isSubmitted) {
      setSelectedKey(key);
    }
  };

  const handleReset = () => {
    setSelectedKey(null);
    setIsSubmitted(false);
  };

  return (
    <section ref={sectionRef} id="sensor-lab" className="py-20 bg-white border-t border-stone-200">
      <div className="max-w-[1680px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
          <span className="text-xs font-black uppercase tracking-widest text-[#B81104] bg-[#FFFACD] px-3 py-1 rounded border border-[#F4E88C]">
            THE PHYSICAL HARDWARE LIBRARY
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#1C1917] tracking-tight">
            Interactive Component &amp; Sensor Knowledge Bank
          </h2>
          <p className="text-stone-600 font-medium">
            Click any STEM component below to see how EDINNO extracts physical pins, working physics, and constructs targeted diagnostic questions.
          </p>
        </div>

        {/* Component Tabs Bar */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          {SENSOR_CATALOG.map((sensor) => {
            const isActive = activeSensor.id === sensor.id;
            return (
              <button
                key={sensor.id}
                onClick={() => handleSelectSensor(sensor)}
                className={`px-5 py-3 rounded-md text-sm font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? "bg-[#B81104] text-[#FFFACD] shadow-md border-2 border-[#8F0D03] scale-105"
                    : "bg-[#FDFBF7] text-stone-700 border-2 border-stone-200 hover:border-stone-300"
                }`}
              >
                <Cpu className={`w-4 h-4 ${isActive ? "text-[#FFFACD]" : "text-[#B81104]"}`} />
                <span>
                  {sensor.name.split(" ")[0]} ({sensor.category.split(" ")[0]})
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Sensor Detailed Card */}
        <div className="bg-[#FDFBF7] rounded p-8 border-2 border-stone-200 shadow-md">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Component Specs */}
            <div className="lg:col-span-6 space-y-5">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded text-xs font-extrabold bg-[#FFFACD] text-[#8F0D03] border border-[#F4E88C]">
                  {activeSensor.badge}
                </span>
                <span className="text-xs font-bold text-stone-500">
                  Category: {activeSensor.category}
                </span>
              </div>

              <h3 className="text-2xl font-black text-[#1C1917]">
                {activeSensor.name}
              </h3>

              {/* Pin Configuration */}
              <div>
                <h4 className="text-xs font-extrabold text-[#B81104] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Physical Pin Architecture ({activeSensor.pins.length} Pins)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {activeSensor.pins.map((pin, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-md bg-white border border-stone-300 text-xs font-mono font-bold text-stone-800 shadow-2xs"
                    >
                      {pin}
                    </span>
                  ))}
                </div>
              </div>

              {/* Working Principle */}
              <div>
                <h4 className="text-xs font-extrabold text-stone-900 uppercase tracking-wider mb-1.5">
                  Working Principle &amp; Physics
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed font-medium bg-white p-3.5 rounded-md border border-stone-200">
                  {activeSensor.workingPrinciple}
                </p>
              </div>

              {/* Safety Rule */}
              <div>
                <h4 className="text-xs font-extrabold text-[#B81104] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Hardware Lab Safety Rule
                </h4>
                <p className="text-xs text-[#8F0D03] bg-[#FFFACD]/60 p-3.5 rounded-md border border-[#F4E88C] font-semibold">
                  {activeSensor.safetyRule}
                </p>
              </div>
            </div>

            {/* Right Column: Live Dynamic Question Card */}
            <div className="lg:col-span-6">
              <div className="bg-white rounded-md p-6 border-2 border-stone-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B81104]" />
                    <span className="text-xs font-black uppercase tracking-wide text-stone-800">
                      Live Dynamic AI Diagnostic
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-stone-500">
                    {isLoadingQuestion ? "Synthesizing..." : "Select An Option"}
                  </span>
                </div>

                {isLoadingQuestion ? (
                  <div className="space-y-3 py-4 animate-pulse">
                    <div className="h-4 bg-stone-200 rounded w-5/6" />
                    <div className="h-4 bg-stone-200 rounded w-3/4" />
                    <div className="space-y-2 pt-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-10 bg-stone-100 border border-stone-200 rounded-md" />
                      ))}
                    </div>
                  </div>
                ) : questionError ? (
                  <div className="py-6 space-y-3 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
                    <p className="text-xs font-medium text-stone-600 max-w-sm mx-auto">
                      {questionError}
                    </p>
                    <button
                      type="button"
                      onClick={handleRetrySynthesis}
                      className="px-4 py-2 rounded-md bg-[#B81104] text-[#FFFACD] font-bold text-xs hover:bg-[#8F0D03] transition-colors cursor-pointer"
                    >
                      Retry Question Synthesis
                    </button>
                  </div>
                ) : activeQuestion ? (
                  <>
                    <p className="text-sm font-bold text-stone-900 leading-snug">
                      {activeQuestion.question}
                    </p>

                    {/* Options */}
                    <div className="space-y-2.5">
                      {options.map((opt) => {
                        const isSelected = selectedKey === opt.key;
                        const isCorrect = isAnswerCorrect(opt.key, opt.text);
                        let optionClass = "bg-[#FDFBF7] border-stone-200 text-stone-800 hover:border-[#B81104]";

                        if (isSubmitted) {
                          if (isCorrect) {
                            optionClass = "bg-emerald-50 border-emerald-500 text-emerald-900 font-bold";
                          } else if (isSelected && !isCorrect) {
                            optionClass = "bg-red-50 border-red-500 text-red-900";
                          }
                        } else if (isSelected) {
                          optionClass = "bg-[#FFFACD] border-[#B81104] text-[#8F0D03] font-bold shadow-xs";
                        }

                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => handleSelectOption(opt.key)}
                            className={`w-full text-left p-3 rounded-md border-2 transition-all flex items-center justify-between cursor-pointer text-xs ${optionClass}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-5 h-5 rounded-md bg-stone-200/70 text-stone-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                                {opt.key}
                              </span>
                              <span>{opt.text}</span>
                            </div>
                            {isSubmitted && isCorrect && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Submit / Reset Actions */}
                    <div className="pt-2 flex items-center justify-between">
                      {!isSubmitted ? (
                        <button
                          type="button"
                          disabled={selectedKey === null}
                          onClick={() => setIsSubmitted(true)}
                          className="px-5 py-2.5 rounded-md text-xs font-extrabold text-[#FFFACD] bg-[#B81104] hover:bg-[#8F0D03] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          Verify Answer
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleReset}
                          className="px-4 py-2 rounded-md text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Try Another Option</span>
                        </button>
                      )}

                      {isSubmitted && (
                        <span className="text-xs font-extrabold">
                          {userGotItRight ? (
                            <span className="text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> Correct Answer (+1 Mark)
                            </span>
                          ) : (
                            <span className="text-red-700 flex items-center gap-1">
                              Incorrect choice. See rationale below.
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Explanation Callout */}
                    {isSubmitted && activeQuestion.explanation && (
                      <div className="p-3.5 rounded-md bg-[#FFFACD]/60 border border-[#F4E88C] text-xs text-[#8F0D03]">
                        <span className="font-extrabold">Curriculum Rationale: </span>
                        {activeQuestion.explanation}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
