"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { checkBackendHealth } from "../lib/api";
import { useAssessment } from "../lib/store";
import {
  Sparkles,
  UploadCloud,
  FileText,
  Sliders,
  CheckSquare,
  RotateCcw,
  ExternalLink,
  Cpu
} from "lucide-react";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { resetAll, extractedResources, assessmentPayload } = useAssessment();

  const [health, setHealth] = useState<{ status: string; service: string }>({
    status: "checking",
    service: "FastAPI Engine",
  });

  useEffect(() => {
    checkBackendHealth().then(setHealth);
    const interval = setInterval(() => {
      checkBackendHealth().then(setHealth);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = health.status === "healthy";

  const getStepNumber = () => {
    if (pathname === "/") return 1;
    if (pathname === "/merge") return 2;
    if (pathname === "/configure") return 3;
    if (pathname === "/results") return 4;
    return 1;
  };

  const currentStep = getStepNumber();
  const hasExtractedDocs = Object.keys(extractedResources).length > 0;
  const hasAssessment = !!assessmentPayload;

  const steps = [
    { step: 1, label: "Ingest PDFs", href: "/", icon: UploadCloud, enabled: true },
    { step: 2, label: "Review Corpus", href: "/merge", icon: FileText, enabled: hasExtractedDocs },
    { step: 3, label: "Configure Blueprint", href: "/configure", icon: Sliders, enabled: hasExtractedDocs },
    { step: 4, label: "Question Workbench", href: "/results", icon: CheckSquare, enabled: hasAssessment },
  ];

  const handleReset = () => {
    if (confirm("Reset current assessment session and clear staged documents?")) {
      resetAll();
      router.push("/");
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-[#FFFFFF]/90 backdrop-blur-md border-b border-[#EAE5D9] transition-all">
      <div className="max-w-7xl xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-500 text-white flex items-center justify-center shadow-xs shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-slate-900 tracking-tight text-base">
                EDINNO
              </span>
              <span className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                PRO v2.0
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline leading-none">
              STEM Assessment Studio
            </span>
          </div>
        </Link>

        {/* Central Segmented Stepper */}
        <nav className="flex items-center bg-[#F4EFE6]/70 border border-[#EAE5D9] p-1 rounded-xl shadow-inner">
          {steps.map((s) => {
            const Icon = s.icon;
            const isActive = currentStep === s.step;
            const isCompleted = currentStep > s.step;

            return (
              <Link
                key={s.step}
                href={s.enabled ? s.href : "#"}
                onClick={(e) => {
                  if (!s.enabled) e.preventDefault();
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-white text-blue-700 shadow-xs border border-blue-100"
                    : isCompleted
                    ? "text-slate-700 hover:text-slate-900 hover:bg-white/60"
                    : s.enabled
                    ? "text-slate-500 hover:text-slate-800"
                    : "text-slate-300 cursor-not-allowed"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : isCompleted
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isCompleted ? "✓" : s.step}
                </div>
                <span className="hidden md:inline">{s.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Status & Tools */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Health Pill */}
          <div
            title={isOnline ? "FastAPI backend reachable on port 8000" : "Connecting to backend..."}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              isOnline
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span className="font-semibold text-[11px] hidden lg:inline">
              {isOnline ? "FastAPI Online" : "Backend Offline"}
            </span>
          </div>

          {/* Reset button */}
          {hasExtractedDocs && (
            <button
              type="button"
              onClick={handleReset}
              title="Reset Assessment Session"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* API Docs Link */}
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            title="Open Interactive FastAPI Docs (Swagger)"
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-blue-700 bg-white border border-[#EAE5D9] hover:border-blue-300 rounded-lg shadow-2xs transition-all"
          >
            <span>Swagger API</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </header>
  );
}
