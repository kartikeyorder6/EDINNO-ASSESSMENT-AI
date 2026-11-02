"use client";

import React from "react";
import { StudioView } from "../types";
import { Compass, BookOpen, Sparkles, LineChart } from "lucide-react";

interface StudioHeaderProps {
  activeView: StudioView;
  onSelectView: (view: StudioView) => void;
  onOpenMobileMenu: () => void;
}

export function StudioHeader({
  activeView,
  onSelectView,
  onOpenMobileMenu,
}: StudioHeaderProps) {
  return (
    <div className="sticky top-4 z-30 mb-6 w-full flex items-center justify-center px-4 pointer-events-none">
      <nav
        aria-label="Studio View Switcher"
        className="pointer-events-auto inline-flex items-center gap-1 p-1 bg-white/95 backdrop-blur-xl border border-stone-200/90 rounded-lg shadow-lg shadow-stone-900/6 max-w-full overflow-x-auto transition-all"
      >
        {/* Mobile Menu Trigger */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden p-1.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 cursor-pointer transition-colors shrink-0"
          aria-label="Open navigation menu"
          title="Open Menu"
        >
          <Compass className="w-4 h-4 text-[#B81104]" />
        </button>

        {/* Top Pill View Switcher */}
        <button
          type="button"
          onClick={() => onSelectView("curriculum")}
          className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeView === "curriculum"
              ? "bg-[#B81104] text-white shadow-2xs"
              : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/80"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Curriculum View</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectView("generate")}
          className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeView === "generate"
              ? "bg-[#B81104] text-white shadow-2xs"
              : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/80"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Generate Assessment</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectView("tracker")}
          className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeView === "tracker"
              ? "bg-[#B81104] text-white shadow-2xs"
              : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/80"
          }`}
        >
          <LineChart className="w-3.5 h-3.5" />
          <span>Student Tracker</span>
        </button>
      </nav>
    </div>
  );
}
