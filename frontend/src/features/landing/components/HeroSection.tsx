"use client";

import React from "react";
import Link from "next/link";
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  BookOpen,
  ShieldCheck,
  Zap,
  Cpu,
  HelpCircle,
} from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative pt-24 sm:pt-32 pb-20 overflow-hidden bg-[#FDFBF7] bg-[linear-gradient(to_right,#b811040a_1px,transparent_1px),linear-gradient(to_bottom,#b811040a_1px,transparent_1px)] bg-[size:32px_32px]">
      {/* Subtle decorative glow */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-[#FFFACD]/60 via-[#FDFBF7]/30 to-transparent blur-3xl pointer-events-none -z-10" />

      <div className="max-w-[1680px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Headline & Value Proposition */}
          <div className="lg:col-span-7 space-y-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded bg-[#FFFACD] border border-[#F4E88C] text-[#8F0D03] text-xs font-extrabold tracking-wide shadow-sm">
              <Sparkles className="w-4 h-4 text-[#B81104]" />
              <span>PEDAGOGICALLY ALIGNED TO BLOOM&apos;S TAXONOMY</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#1C1917] tracking-tight leading-[1.12]">
              Transform Hardware Lessons Into{" "}
              <span className="text-[#B81104] underline decoration-[#FFFACD] decoration-wavy decoration-4">
                Visual, Safe &amp; Smart
              </span>{" "}
              STEM Assessments.
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-stone-600 font-medium leading-relaxed max-w-2xl">
              The AI-powered evaluation engine built specifically for robotics and hands-on STEM education.
              Upload PDF textbooks, extract physical sensor pinouts, eliminate confusing programming syntax questions, and
              generate verified, authentic examinations in seconds.
            </p>

            {/* Key Features Pill Strip */}
            <div className="flex flex-wrap gap-2.5 pt-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white border border-stone-200 text-xs font-semibold text-stone-700 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B81104]" />
                <span>Zero Code Hallucinations</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white border border-stone-200 text-xs font-semibold text-stone-700 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B81104]" />
                <span>Real Sensor Photo Extraction</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white border border-stone-200 text-xs font-semibold text-stone-700 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#B81104]" />
                <span>100% Curriculum Grounded</span>
              </div>
            </div>

            {/* Primary Call to Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
              <Link
                href="/studio"
                className="inline-flex items-center justify-center gap-3 px-7 py-4 rounded-md text-base font-extrabold text-[#FFFACD] bg-[#B81104] hover:bg-[#9E0E03] shadow-lg shadow-[#B81104]/25 hover:shadow-xl hover:-translate-y-0.5 transition-all border border-[#8F0D03]"
              >
                <Sparkles className="w-5 h-5" />
                <span>Launch Studio Dashboard</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/studio?tab=curriculum"
                className="inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-md text-base font-extrabold text-stone-800 bg-[#FFFACD] hover:bg-[#F9F1AE] border-2 border-[#F4E88C] shadow-sm hover:shadow transition-all"
              >
                <BookOpen className="w-5 h-5 text-[#B81104]" />
                <span>Explore Grades 6–12</span>
              </Link>
            </div>

            {/* Quick Trust Stat */}
            <div className="flex items-center gap-6 pt-3 text-xs text-stone-500 font-semibold">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>5-Tier Active AI Failover (100% Uptime)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#B81104]" />
                <span>ReportLab Publication PDF Ready</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Infographic Interactive Card */}
          <div className="lg:col-span-5">
            <div className="relative bg-white rounded p-6 shadow-xl border-2 border-stone-200/90 shadow-stone-200/50">
              {/* Infographic Header Badge */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#B81104]" />
                  <span className="w-3 h-3 rounded-full bg-[#FFFACD] border border-amber-300" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400" />
                  <span className="text-xs font-bold text-stone-500 ml-1">INFOGRAPHIC WORKBENCH PREVIEW</span>
                </div>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#B81104] bg-[#FFFACD] px-2.5 py-0.5 rounded border border-[#F4E88C]">
                  LIVE SIMULATOR
                </span>
              </div>

              {/* Pipeline Flow Infographic Visual */}
              <div className="space-y-4">
                <div className="p-4 rounded-md bg-[#FFFACD]/40 border border-[#F4E88C] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-[#8F0D03] uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[#B81104]" />
                      1. INGESTED HARDWARE CONCEPT
                    </span>
                    <span className="text-[10px] font-bold bg-[#B81104] text-[#FFFACD] px-2 py-0.5 rounded">
                      PYMUPDF EXTRACTED
                    </span>
                  </div>
                  <div className="flex items-center gap-3 bg-white p-2.5 rounded-md border border-stone-200">
                    <div className="w-10 h-10 rounded bg-red-50 text-[#B81104] flex items-center justify-center font-bold text-xs shrink-0">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-900 leading-tight">
                        HC-SR04 Ultrasonic Distance Sensor
                      </h4>
                      <p className="text-[11px] text-stone-500 font-medium">
                        4 Physical Pins • VCC (5V), Trig, Echo, GND • Speed of Sound Ranging
                      </p>
                    </div>
                  </div>
                </div>

                {/* Generated Question Card Simulation */}
                <div className="p-4 rounded-md bg-stone-50 border border-stone-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-[#B81104]" />
                      2. AI GENERATED QUESTION (ZERO CODE SYNTAX)
                    </span>
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                      [1 MARK] MCQ
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-stone-800 leading-relaxed">
                    &quot;Based on the verified curriculum documentation, which pin terminal
                    is pulsed with a 10µs signal to trigger sound wave emission?&quot;
                  </p>

                  {/* Options */}
                  <div className="grid grid-cols-2 gap-2 text-xs font-medium">
                    <div className="p-2 rounded bg-white border border-stone-200 text-stone-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-stone-100 text-stone-600 font-bold text-[10px] flex items-center justify-center">
                        A
                      </span>
                      <span>Echo Pin</span>
                    </div>
                    <div className="p-2 rounded bg-[#FFFACD] border-2 border-[#B81104] text-[#8F0D03] font-bold flex items-center gap-2 shadow-xs">
                      <span className="w-5 h-5 rounded bg-[#B81104] text-[#FFFACD] font-bold text-[10px] flex items-center justify-center">
                        B
                      </span>
                      <span>Trig Pin (Correct)</span>
                    </div>
                    <div className="p-2 rounded bg-white border border-stone-200 text-stone-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-stone-100 text-stone-600 font-bold text-[10px] flex items-center justify-center">
                        C
                      </span>
                      <span>VCC (5V)</span>
                    </div>
                    <div className="p-2 rounded bg-white border border-stone-200 text-stone-700 flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-stone-100 text-stone-600 font-bold text-[10px] flex items-center justify-center">
                        D
                      </span>
                      <span>GND Pin</span>
                    </div>
                  </div>
                </div>

                {/* Assessment Ready Status */}
                <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-emerald-600 text-white flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-emerald-900">
                        Assessment Paper Status: Verified
                      </div>
                      <div className="text-[10px] font-mono text-emerald-700">
                        TAXONOMY: BALANCED 5-QUESTION SUITE
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded bg-emerald-600 text-white">
                    READY
                  </span>
                </div>
              </div>

              {/* Footer link inside card */}
              <div className="pt-4 mt-4 border-t border-stone-100 text-center">
                <Link
                  href="/studio?tab=curriculum&upload=true"
                  className="text-xs font-extrabold text-[#B81104] hover:text-[#8F0D03] inline-flex items-center gap-1 group"
                >
                  <span>Click here to test your own curriculum PDF</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
