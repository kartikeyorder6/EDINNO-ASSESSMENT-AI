"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  UploadCloud,
  Cpu,
  Lock,
  Unlock,
  Sparkles,
  HelpCircle,
  Wrench,
  FileText,
  ChevronRight,
} from "lucide-react";
import {
  generatePreAssembly,
  verifyPreAssembly,
  checkAssemblyStatus,
} from "../lib/api";
import { QuestionItem, PreAssemblyVerifyResponse, AssemblyAccessStatus } from "../types";

export default function PreAssemblyQuiz() {
  // Custom PDF upload state
  const [customFile, setCustomFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quiz state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<PreAssemblyVerifyResponse | null>(null);
  const [assemblyStatus, setAssemblyStatus] = useState<AssemblyAccessStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAssemblyWorkspace, setShowAssemblyWorkspace] = useState<boolean>(false);

  const handleStartQuiz = async () => {
    if (!customFile) {
      setErrorMsg("Please select or upload a target hardware project PDF first.");
      return;
    }
    setIsGenerating(true);
    setErrorMsg(null);
    setVerificationResult(null);
    setAssemblyStatus(null);
    setUserAnswers({});
    setCurrentQIndex(0);
    setShowAssemblyWorkspace(false);

    try {
      const titleToUse = projectTitle.trim() || customFile.name.replace(/\.pdf$/i, "");
      const resp = await generatePreAssembly(customFile, titleToUse);
      setProjectTitle(resp.chapter_name || titleToUse);
      setQuestions(resp.questions || []);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to generate pre-assembly safety quiz from the uploaded PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectOption = (qId: string | number, optionKey: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [String(qId)]: optionKey,
    }));
  };

  const handleSubmitQuiz = async () => {
    if (questions.length === 0 || !customFile) return;
    const answeredCount = Object.keys(userAnswers).length;
    if (answeredCount < questions.length) {
      if (
        !confirm(
          `You have answered ${answeredCount} of ${questions.length} questions. Unanswered questions will be marked incorrect. Proceed?`
        )
      ) {
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const pid = customFile.name.replace(/\.pdf$/i, "");
      const result = await verifyPreAssembly({
        project_id: pid,
        project_title: projectTitle || pid,
        answers: userAnswers,
        questions: questions,
      });

      setVerificationResult(result);

      // Verify backend assembly gate
      const gate = await checkAssemblyStatus(pid);
      setAssemblyStatus(gate);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to verify quiz submission on the backend.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setCustomFile(file);
      const cleanTitle = file.name
        .replace(/\.pdf$/i, "")
        .replace(/^\d+[\s_-]*/, "")
        .replace(/\(.*?\)/g, "")
        .trim();
      setProjectTitle(cleanTitle || file.name.replace(/\.pdf$/i, ""));
    }
  };

  const currentQ = questions[currentQIndex];
  const qIdStr = currentQ ? String(currentQ.id ?? currentQIndex) : "";

  return (
    <div className="bg-white border border-[#EAE5D9] rounded-2xl p-5 sm:p-7 shadow-xs mb-8 transition-all">
      {/* Top Banner & Instructions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 mb-6 border-b border-slate-100">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-xs font-bold text-red-700 mb-2">
            <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
            <span>Mandatory Pre-Assembly Readiness Check</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Pre-Assembly Component & Safety Quiz
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
            Safety protocol requires all students to verify component pinouts, ratings, and hazards prior to physical hardware wiring. Upload your project PDF and complete the 5-question readiness check with at least 80% passing grade to unlock the assembly workspace.
          </p>
        </div>

        {/* Gate Status Pill */}
        <div className="flex items-center gap-2.5 bg-[#FBF9F5] border border-[#EAE5D9] px-4 py-2.5 rounded-xl self-start md:self-auto shrink-0 shadow-2xs">
          {assemblyStatus?.allowed ? (
            <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
              <Unlock className="w-4 h-4 text-emerald-600" />
              <span>Assembly Clearance Granted</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-700 font-bold text-xs">
              <Lock className="w-4 h-4 text-amber-600" />
              <span>Assembly Locked (Quiz Required)</span>
            </div>
          )}
        </div>
      </div>

      {/* Error alert */}
      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STAGE 1: DYNAMIC PROJECT UPLOAD & SAFETY SETUP */}
      {questions.length === 0 && (
        <div className="space-y-6">
          <div className="bg-[#FBF9F5] border border-[#EAE5D9] rounded-2xl p-6 sm:p-8">
            <div className="max-w-2xl mx-auto text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Upload Target Hardware Project PDF
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Upload your hardware project ebook or lab guide. Antigravity AI dynamically analyzes required component pinouts, operating voltage thresholds, and wiring safety protocols to generate a custom 5-question pre-assembly gatekeeper check.
              </p>
            </div>

            <input
              type="file"
              accept=".pdf"
              ref={fileInputRef}
              onChange={handleCustomFileChange}
              className="hidden"
            />

            {!customFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="max-w-xl mx-auto border-2 border-dashed border-slate-300 hover:border-red-400 bg-white rounded-2xl p-8 text-center cursor-pointer transition-all hover:shadow-xs group"
              >
                <div className="w-12 h-12 rounded-full bg-slate-50 group-hover:bg-red-50 flex items-center justify-center mx-auto mb-3 transition-colors">
                  <FileText className="w-6 h-6 text-slate-400 group-hover:text-red-600 transition-colors" />
                </div>
                <span className="block text-sm font-bold text-slate-800">
                  Click or drag project PDF here
                </span>
                <span className="block text-xs text-slate-400 mt-1">
                  Upload official project specification (.pdf)
                </span>
              </div>
            ) : (
              <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm truncate max-w-xs sm:max-w-sm">
                        {customFile.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {(customFile.size / (1024 * 1024)).toFixed(2)} MB • Project PDF Staged
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomFile(null);
                      setProjectTitle("");
                    }}
                    className="text-xs font-bold text-slate-400 hover:text-red-600 transition-colors p-1"
                  >
                    Change PDF
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Project / Capstone Name
                  </label>
                  <input
                    type="text"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="e.g. Defence Protection System"
                    className="w-full text-xs font-semibold text-slate-900 px-3 py-2 bg-[#FBF9F5] border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>
              </div>
            )}

            <div className="mt-6 text-center">
              <button
                type="button"
                disabled={isGenerating || !customFile}
                onClick={handleStartQuiz}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-extrabold text-sm shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Analyzing Components & Generating Safety MCQs...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Pre-Assembly Safety & Readiness Quiz</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: QUIZ QUESTIONS RUNNER */}
      {questions.length > 0 && !verificationResult && (
        <div>
          {/* Header Info */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Hardware Project
              </span>
              <h3 className="font-extrabold text-slate-900 text-base">{projectTitle}</h3>
            </div>

            {/* Pagination Tabs */}
            <div className="flex items-center gap-1.5">
              {questions.map((q, idx) => {
                const qKey = String(q.id ?? idx);
                const isAnswered = !!userAnswers[qKey];
                const isCurrent = idx === currentQIndex;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentQIndex(idx)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-slate-900 text-white shadow-xs"
                        : isAnswered
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Question Card */}
          {currentQ && (
            <div className="bg-[#FBF9F5] border border-[#EAE5D9] rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-red-100 text-red-800">
                  Question {currentQIndex + 1} of {questions.length} • Component Readiness
                </span>
                <span className="text-xs font-semibold text-slate-400">1 Mark</span>
              </div>

              <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-5 leading-relaxed">
                {currentQ.question}
              </h4>

              {/* Options */}
              <div className="space-y-3">
                {currentQ.options && typeof currentQ.options === "object" && (
                  Array.isArray(currentQ.options)
                    ? currentQ.options.map((opt, oIdx) => {
                        const optKey = ["A", "B", "C", "D"][oIdx] || String(oIdx);
                        const isSelected = userAnswers[qIdStr] === optKey;
                        return (
                          <div
                            key={oIdx}
                            onClick={() => handleSelectOption(qIdStr, optKey)}
                            className={`p-3.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer flex items-center gap-3 ${
                              isSelected
                                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                : "bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                                isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {optKey}
                            </span>
                            <span>{opt}</span>
                          </div>
                        );
                      })
                    : Object.entries(currentQ.options).map(([key, value]) => {
                        const isSelected = userAnswers[qIdStr] === key;
                        return (
                          <div
                            key={key}
                            onClick={() => handleSelectOption(qIdStr, key)}
                            className={`p-3.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer flex items-center gap-3 ${
                              isSelected
                                ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                : "bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                                isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {key}
                            </span>
                            <span>{value}</span>
                          </div>
                        );
                      })
                )}
              </div>
            </div>
          )}

          {/* Navigation & Submit */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentQIndex === 0}
                onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentQIndex === questions.length - 1}
                onClick={() => setCurrentQIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuestions([])}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer"
              >
                Cancel / Choose Another Project
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitQuiz}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying with Backend...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Submit & Verify for Assembly</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3: RESULTS & VERIFICATION GATEWAY */}
      {verificationResult && (
        <div>
          {/* Header Outcome Card */}
          <div
            className={`p-6 rounded-2xl border mb-6 ${
              verificationResult.passed
                ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                : "bg-amber-50/80 border-amber-200 text-amber-950"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs ${
                    verificationResult.passed ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                  }`}
                >
                  {verificationResult.passed ? <ShieldCheck className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-lg sm:text-xl">
                    {verificationResult.passed
                      ? "Assembly Authorization Granted"
                      : "Assembly Access Denied — Safety Review Required"}
                  </h3>
                  <p className="text-xs sm:text-sm mt-0.5 opacity-90">{verificationResult.message}</p>
                </div>
              </div>

              {/* Score Badge */}
              <div className="text-right bg-white/70 border border-white/80 p-3 rounded-xl shrink-0 shadow-2xs">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-500">
                  Readiness Score
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {verificationResult.score} / {verificationResult.total}
                  <span className="text-xs font-bold text-slate-400 ml-1">
                    ({verificationResult.percentage}%)
                  </span>
                </div>
                <div className="text-[10px] font-semibold text-slate-400">
                  Threshold: {verificationResult.passing_threshold}%
                </div>
              </div>
            </div>

            {/* Token display */}
            {verificationResult.authorization_token && (
              <div className="mt-4 pt-4 border-t border-emerald-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-emerald-900">Backend Clearance Token:</span>
                  <code className="font-mono font-bold bg-white px-2.5 py-1 rounded-md border border-emerald-300 text-emerald-800">
                    {verificationResult.authorization_token}
                  </code>
                </div>
                <span className="text-[11px] text-emerald-700">Valid for active build session</span>
              </div>
            )}
          </div>

          {/* Detailed Question Review Breakdown */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-slate-900 mb-3">Safety Verification Review:</h4>
            <div className="space-y-3">
              {verificationResult.details.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border text-xs ${
                    item.is_correct
                      ? "bg-white border-slate-200"
                      : "bg-red-50/40 border-red-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-bold text-slate-900 text-sm">
                      Q{idx + 1}. {item.question}
                    </span>
                    {item.is_correct ? (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200 shrink-0">
                        <XCircle className="w-3.5 h-3.5" /> Incorrect
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] mt-2 pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400">Your selection: </span>
                      <strong className={item.is_correct ? "text-emerald-700" : "text-red-700"}>
                        {item.user_answer || "None"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Required correct answer: </span>
                      <strong className="text-slate-800">{item.correct_answer}</strong>
                    </div>
                  </div>

                  {item.explanation && (
                    <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <strong>Safety Rationale:</strong> {item.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleStartQuiz}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry Quiz / Different Project</span>
            </button>

            {verificationResult.passed ? (
              <button
                type="button"
                onClick={() => setShowAssemblyWorkspace(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-all cursor-pointer animate-pulse"
              >
                <Wrench className="w-4 h-4" />
                <span>Proceed to Physical Assembly Workspace →</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700">
                <Lock className="w-4 h-4" />
                <span>Minimum 80% passing grade required to proceed to assembly.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STAGE 4: ASSEMBLY WORKSPACE MODAL / VIEW */}
      {showAssemblyWorkspace && (
        <div className="mt-6 p-6 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base">Assembly Workspace: {projectTitle}</h3>
                <p className="text-xs text-slate-400">Safety clearance verified via backend token</p>
              </div>
            </div>
            <span className="font-mono text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30">
              UNLOCKED
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mb-5">
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <h5 className="font-bold text-slate-200 mb-1">Step 1: Power Safety</h5>
              <p className="text-slate-400">Ensure the USB cable is disconnected before wiring breadboard rail connections.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <h5 className="font-bold text-slate-200 mb-1">Step 2: Polarity Inspection</h5>
              <p className="text-slate-400">Double check LED anode (+) vs cathode (-) and VCC vs GND pins on sensors.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <h5 className="font-bold text-slate-200 mb-1">Step 3: Signal Verification</h5>
              <p className="text-slate-400">Connect signal/analog pins securely to designated headers before applying 5V power.</p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowAssemblyWorkspace(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer"
            >
              Close Workspace Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
