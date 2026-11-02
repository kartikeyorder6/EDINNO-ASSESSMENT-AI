import React from "react";
import { Cpu, Zap, Wrench, ShieldCheck, Layers } from "lucide-react";

export function AssessmentTypesSection() {
  return (
    <section id="assessment-types" className="py-20 bg-[#FDFBF7]">
      <div className="max-w-[1680px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span className="text-xs font-black uppercase tracking-widest text-[#B81104] bg-[#FFFACD] px-3 py-1 rounded border border-[#F4E88C]">
            BALANCED QUESTION TAXONOMY
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#1C1917] tracking-tight">
            5 Distinct Assessment Types for Deep Hardware Mastery
          </h2>
          <p className="text-stone-600 font-medium">
            EDINNO prevents mindless memorization by automatically generating a healthy balance of visual identification, pinouts, and physical scenarios.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {/* Type 1: Component ID */}
          <div className="bg-white rounded p-6 border-2 border-stone-200 hover:border-[#B81104] transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-md bg-red-100 text-[#B81104] flex items-center justify-center mb-4">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-stone-900 mb-1">
                1. Component ID
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                Identifies sensor packages, physical shapes, IC designations, and primary real-world functions.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] font-bold text-[#8F0D03]">
              Visual Photo Embeds
            </div>
          </div>

          {/* Type 2: Pin Identification */}
          <div className="bg-white rounded p-6 border-2 border-stone-200 hover:border-[#B81104] transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-stone-900 mb-1">
                2. Pin Identification
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                Tests exact pin counts, VCC voltages, input trigger lines, and output sensor return signals.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] font-bold text-[#8F0D03]">
              Pin Architecture Focus
            </div>
          </div>

          {/* Type 3: Troubleshooting Scenarios */}
          <div className="bg-white rounded p-6 border-2 border-stone-200 hover:border-[#B81104] transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-md bg-blue-100 text-blue-800 flex items-center justify-center mb-4">
                <Wrench className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-stone-900 mb-1">
                3. Lab Scenarios
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                Real troubleshooting puzzles: resolving power brownouts, sensor voltage divider limits, and signal timing constraints.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] font-bold text-[#8F0D03]">
              Critical Thinking
            </div>
          </div>

          {/* Type 4: Conceptual True/False */}
          <div className="bg-white rounded p-6 border-2 border-stone-200 hover:border-[#B81104] transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-md bg-purple-100 text-purple-800 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-stone-900 mb-1">
                4. Conceptual T/F
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                Addresses common student misconceptions regarding current limiting, pull-up resistors, and power limits.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] font-bold text-[#8F0D03]">
              Safety Principles
            </div>
          </div>

          {/* Type 5: Matching Matrices */}
          <div className="bg-white rounded p-6 border-2 border-stone-200 hover:border-[#B81104] transition-all flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-stone-900 mb-1">
                5. Matching Puzzles
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                Connects sensor operating physics to everyday robotics: radar, automatic lights, and thermostats.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] font-bold text-[#8F0D03]">
              STEM Application
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
