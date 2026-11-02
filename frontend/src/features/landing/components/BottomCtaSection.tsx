import React from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, Layers } from "lucide-react";

export function BottomCtaSection() {
  return (
    <section className="py-20 bg-[#FDFBF7]">
      <div className="max-w-[1680px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="relative rounded bg-[#B81104] text-[#FFFACD] p-10 sm:p-14 overflow-hidden shadow-2xl border-4 border-[#8F0D03]">
          {/* Background design elements */}
          <div className="absolute -right-20 -bottom-20 w-96 h-96 rounded-full bg-[#FFFACD]/10 pointer-events-none" />
          <div className="absolute -left-10 -top-10 w-64 h-64 rounded-full bg-black/10 pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#FFFACD] text-[#8F0D03] text-xs font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-[#B81104]" /> READY TO EVALUATE YOUR LAB?
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
              Empower Young Makers with Intelligent, Safe Hardware Assessments.
            </h2>

            <p className="text-[#FFFACD]/90 text-base sm:text-lg font-medium leading-relaxed">
              Whether you teach 30 students in a middle school robotics lab or design STEM textbooks,
              EDINNO generates non-repetitive, diagram-rich evaluations in under 5 seconds.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
              <Link
                href="/studio"
                className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-md text-base font-extrabold text-[#8F0D03] bg-[#FFFACD] hover:bg-[#F9F1AE] shadow-lg shadow-black/20 hover:scale-102 transition-all border-2 border-[#F4E88C]"
              >
                <Sparkles className="w-5 h-5 text-[#B81104]" />
                <span>Launch Studio Dashboard</span>
                <ArrowRight className="w-5 h-5 text-[#B81104]" />
              </Link>

              <Link
                href="/studio?tab=generate"
                className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-md text-base font-extrabold text-white bg-[#8F0D03] hover:bg-[#720B02] border border-white/20 transition-all"
              >
                <Layers className="w-5 h-5" />
                <span>Create Merged Master Exam</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
