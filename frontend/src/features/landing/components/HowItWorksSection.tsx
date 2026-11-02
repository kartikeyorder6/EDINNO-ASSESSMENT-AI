import React from "react";
import { UploadCloud, Sliders, ShieldCheck, Printer, Check } from "lucide-react";

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 bg-[#FDFBF7]">
      <div className="max-w-[1680px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span className="text-xs font-black uppercase tracking-widest text-[#B81104] bg-[#FFFACD] px-3 py-1 rounded border border-[#F4E88C]">
            THE PEDAGOGICAL PIPELINE
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#1C1917] tracking-tight">
            From Raw PDF Textbooks to Publication-Ready Assessments
          </h2>
          <p className="text-stone-600 font-medium">
            See how EDINNO breaks down hardware curricula into Bloom&apos;s-aligned evaluations without manual teacher effort.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
          {/* Step 1 */}
          <div className="relative bg-white rounded p-6 border-2 border-stone-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-md bg-[#B81104] text-[#FFFACD] flex items-center justify-center font-black text-lg mb-4 shadow-sm border border-[#8F0D03]">
              01
            </div>
            <h3 className="text-lg font-extrabold text-stone-900 mb-2 flex items-center gap-1.5">
              <UploadCloud className="w-5 h-5 text-[#B81104]" />
              Ingest PDF Curricula
            </h3>
            <p className="text-xs text-stone-600 font-medium leading-relaxed">
              Upload student workbooks, teacher guides, or project briefs. PyMuPDF automatically splits chapters,
              calculates reading complexity, and catalogs topic categories.
            </p>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-1.5 text-[11px] font-bold text-[#8F0D03]">
              <Check className="w-3.5 h-3.5" /> 100 MB &amp; 500 Page Capacity
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative bg-white rounded p-6 border-2 border-stone-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-md bg-[#FFFACD] text-[#8F0D03] flex items-center justify-center font-black text-lg mb-4 border-2 border-[#F4E88C]">
              02
            </div>
            <h3 className="text-lg font-extrabold text-stone-900 mb-2 flex items-center gap-1.5">
              <Sliders className="w-5 h-5 text-[#B81104]" />
              Extract Pinouts &amp; Vision
            </h3>
            <p className="text-xs text-stone-600 font-medium leading-relaxed">
              The engine isolates high-resolution sensor photographs and schematics, mapping them to standard hardware pin counts (e.g. HC-SR04 4 pins, SG90 3 pins).
            </p>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-1.5 text-[11px] font-bold text-[#8F0D03]">
              <Check className="w-3.5 h-3.5" /> Automatic Base64 Image Cropping
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative bg-white rounded p-6 border-2 border-stone-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-md bg-[#B81104] text-[#FFFACD] flex items-center justify-center font-black text-lg mb-4 shadow-sm border border-[#8F0D03]">
              03
            </div>
            <h3 className="text-lg font-extrabold text-stone-900 mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-5 h-5 text-[#B81104]" />
              Synthesize &amp; Deduplicate
            </h3>
            <p className="text-xs text-stone-600 font-medium leading-relaxed">
              Negative filters scrub out programming syntax errors. Jaccard distance eliminates repetitive questions,
              guaranteeing balanced component, pinout, and scenario coverage.
            </p>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-1.5 text-[11px] font-bold text-[#8F0D03]">
              <Check className="w-3.5 h-3.5" /> Jaccard Token Distance &lt; 0.55
            </div>
          </div>

          {/* Step 4 */}
          <div className="relative bg-white rounded p-6 border-2 border-stone-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-md bg-[#FFFACD] text-[#8F0D03] flex items-center justify-center font-black text-lg mb-4 border-2 border-[#F4E88C]">
              04
            </div>
            <h3 className="text-lg font-extrabold text-stone-900 mb-2 flex items-center gap-1.5">
              <Printer className="w-5 h-5 text-[#B81104]" />
              Dual-Format Output
            </h3>
            <p className="text-xs text-stone-600 font-medium leading-relaxed">
              Deploy immediately to the interactive digital student test bench, or click to compile a vector ReportLab
              PDF exam with teacher answer keys and rationales.
            </p>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-1.5 text-[11px] font-bold text-[#8F0D03]">
              <Check className="w-3.5 h-3.5" /> Print-Ready ReportLab Engine
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
