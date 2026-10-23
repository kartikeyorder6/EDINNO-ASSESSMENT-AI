"use client";

import React from "react";
import Link from "next/link";
import { UploadCloud, FileText, Settings2, CheckSquare } from "lucide-react";

interface StepProgressProps {
  currentStep: 1 | 2 | 3 | 4;
}

const steps = [
  { step: 1, label: "1. Upload PDFs", href: "/", icon: UploadCloud },
  { step: 2, label: "2. Review & Merge", href: "/merge", icon: FileText },
  { step: 3, label: "3. Configure Type", href: "/configure", icon: Settings2 },
  { step: 4, label: "4. Question Workbench", href: "/results", icon: CheckSquare },
];

export default function StepProgress({ currentStep }: StepProgressProps) {
  return (
    <div className="w-full bg-[#FFFFFF] border-b border-[#E8E4DC] py-3 px-6 shadow-xs mb-8">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isActive = currentStep === s.step;
          const isPassed = currentStep > s.step;

          return (
            <React.Fragment key={s.step}>
              <Link
                href={s.href}
                className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : isPassed
                    ? "text-blue-700 bg-blue-50 hover:bg-blue-100"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isActive
                      ? "bg-white text-blue-600"
                      : isPassed
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {isPassed ? "✓" : s.step}
                </div>
                <span className="hidden sm:inline">{s.label}</span>
              </Link>

              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 rounded-full hidden md:block transition-colors ${
                    isPassed ? "bg-blue-400" : "bg-[#E8E4DC]"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
