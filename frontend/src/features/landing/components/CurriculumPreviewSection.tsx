import React from "react";
import Link from "next/link";
import { ChevronRight, Cpu } from "lucide-react";
import { GRADES_DATA } from "../../../lib/curriculum-data";

export function CurriculumPreviewSection() {
  const grades = Object.values(GRADES_DATA);

  return (
    <section className="py-20 bg-[#FDFBF7] border-t border-stone-200">
      <div className="max-w-[1680px] 2xl:max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span className="text-xs font-black uppercase tracking-widest text-[#B81104] bg-[#FFFACD] px-3 py-1 rounded border border-[#F4E88C]">
            STRUCTURED STEM CURRICULUM
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#1C1917] tracking-tight">
            Pre-Configured Coursework for Grades 6 to 12
          </h2>
          <p className="text-stone-600 font-medium">
            Explore authentic hardware curriculum chapters aligned to CBSE, ICSE, and International STEM standards.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-5">
          {grades.map((item) => {
            const gradeTitle = `${item.name} Coursework`;
            const unitsLabel = "Curriculum Ready";
            const kitLabel = "Hardware-Grounded STEM";
            const desc = `Curriculum modules ready for official PDF ingestion and AI-generated assessment creation.`;

            return (
              <div
                key={item.id}
                className="bg-white rounded p-6 border-2 border-stone-200 hover:border-[#B81104] hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-3 py-1 rounded text-xs font-extrabold bg-[#FFFACD] text-[#8F0D03] border border-[#F4E88C]">
                      Grade {item.id} STEM
                    </span>
                    <span className="text-xs font-bold text-stone-400">
                      {unitsLabel}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-stone-900 mb-1">
                    {gradeTitle}
                  </h3>
                  <div className="text-[11px] font-bold text-[#B81104] mb-2 flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>{kitLabel}</span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed font-medium">
                    {desc}
                  </p>
                </div>
                <div className="pt-6">
                  <Link
                    href={`/studio?grade=${item.id}&tab=curriculum`}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-md bg-stone-100 hover:bg-[#B81104] hover:text-[#FFFACD] text-stone-800 text-xs font-extrabold transition-colors border border-stone-200 cursor-pointer"
                  >
                    <span>Open Grade {item.id}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
