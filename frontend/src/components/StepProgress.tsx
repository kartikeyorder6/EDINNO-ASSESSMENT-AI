"use client";

import React from "react";
import Link from "next/link";
import { UploadCloud, Layers, Settings2, CheckSquare, Check } from "lucide-react";

interface StepProgressProps {
  currentStep: 1 | 2 | 3 | 4;
}

const steps = [
  { step: 1, label: "1. Ingest", href: "/ingest", icon: UploadCloud },
  { step: 2, label: "2. Merge", href: "/merge", icon: Layers },
  { step: 3, label: "3. Configure", href: "/configure", icon: Settings2 },
  { step: 4, label: "4. Results", href: "/results", icon: CheckSquare },
];

export default function StepProgress({ currentStep }: StepProgressProps) {
  return (
    <div className="w-full bg-[#FFFFFF] border-b border-[#EAE5D9] py-2.5 px-4 sm:px-6 mb-6 transition-all">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isActive = currentStep === s.step;
          const isPassed = currentStep > s.step;

          return (
            <React.Fragment key={s.step}>
              <Link
                href={s.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#B81104] text-[#FFFACD] border border-[#8F0D03]"
                    : isPassed
                    ? "text-emerald-800 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200"
                    : "text-stone-500 hover:text-stone-800 hover:bg-stone-50 border border-transparent"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isActive
                      ? "bg-[#FFFACD] text-[#8F0D03]"
                      : isPassed
                      ? "bg-emerald-600 text-white"
                      : "bg-stone-200 text-stone-600"
                  }`}
                >
                  {isPassed ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : s.step}
                </div>
                <Icon className="w-3.5 h-3.5 hidden sm:inline" />
                <span className="hidden sm:inline">{s.label}</span>
                <span className="inline sm:hidden">{s.step}</span>
              </Link>

              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 hidden sm:block transition-colors ${
                    isPassed ? "bg-emerald-400" : "bg-[#EAE5D9]"
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
