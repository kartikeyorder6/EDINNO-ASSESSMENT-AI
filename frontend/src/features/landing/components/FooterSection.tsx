import React from "react";
import Link from "next/link";
import { Cpu } from "lucide-react";

export function FooterSection() {
  return (
    <footer className="bg-white border-t border-stone-200 py-14">
      <div className="max-w-[1680px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Col 1: Brand */}
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-[#B81104] text-[#FFFACD] flex items-center justify-center font-bold">
                <Cpu className="w-6 h-6" />
              </div>
              <span className="text-xl font-black tracking-tight text-[#1C1917]">
                ED<span className="text-[#B81104]">INNO</span>
              </span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed font-medium">
              Autonomous pedagogical assessment engine for robotics, hardware electronics, and physical computing.
            </p>
            <div className="text-[11px] font-bold text-stone-400">
              Palette: Milano Red (#B81104) &amp; Lemon Chiffon (#FFFACD)
            </div>
          </div>

          {/* Col 2: Studio Navigation */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-900 mb-4">
              Studio Tools
            </h4>
            <ul className="space-y-2.5 text-xs font-medium text-stone-600">
              <li>
                <Link href="/studio?tab=curriculum&upload=true" className="hover:text-[#B81104] transition-colors">
                  Curriculum PDF Ingest
                </Link>
              </li>
              <li>
                <Link href="/studio?tab=generate" className="hover:text-[#B81104] transition-colors">
                  Assessment Blueprint Designer
                </Link>
              </li>
              <li>
                <Link href="/drive" className="hover:text-[#B81104] transition-colors">
                  Google Drive Cloud Workspace
                </Link>
              </li>
              <li>
                <Link href="/studio?tab=tracker" className="hover:text-[#B81104] transition-colors">
                  Student Safety &amp; Review Tracker
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Hardware Safety & Grades */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-900 mb-4">
              Safety &amp; Curricula
            </h4>
            <ul className="space-y-2.5 text-xs font-medium text-stone-600">
              {[6, 7, 8, 9, 10, 11, 12].map((g) => (
                <li key={g}>
                  <Link href={`/studio?grade=${g}&tab=curriculum`} className="hover:text-[#B81104] transition-colors">
                    Grade {g} Curriculum Workspace
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: AI & Engine Specifications */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-900 mb-4">
              Engine Architecture
            </h4>
            <ul className="space-y-2.5 text-xs font-medium text-stone-600">
              <li>
                <span className="text-stone-800 font-bold">Inference:</span> Google Gemini 3.8/3.6 Flash &amp; Groq
              </li>
              <li>
                <span className="text-stone-800 font-bold">Extraction:</span> PyMuPDF (`fitz`) Vision Parser
              </li>
              <li>
                <span className="text-stone-800 font-bold">Publishing:</span> ReportLab Two-Pass Canvas
              </li>
              <li>
                <span className="text-stone-800 font-bold">Backend:</span> FastAPI Async with Key Pooling
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-10 mt-10 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 font-medium gap-4">
          <div>
            © 2026 EDINNO AI Assessment Engine. All rights reserved. Designed for STEM Educators.
          </div>
          <div className="flex items-center gap-6">
            <Link href="/studio?tab=curriculum" className="hover:text-[#B81104]">
              Curriculum Hub
            </Link>
            <Link href="/studio" className="hover:text-[#B81104]">
              Studio Dashboard
            </Link>
            <a href="#how-it-works" className="hover:text-[#B81104]">
              Top of Page
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
