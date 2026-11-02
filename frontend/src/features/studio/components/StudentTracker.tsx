"use client";

import React from "react";
import { GradeDefinition } from "../types";
import { Users } from "lucide-react";

interface StudentTrackerProps {
  activeGrade: GradeDefinition;
}

export function StudentTracker({ activeGrade }: StudentTrackerProps) {
  return (
    <div className="space-y-6">
      {/* Clean Header */}
      <div className="p-6 rounded-md bg-white border border-stone-200 shadow-xs space-y-1">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm bg-stone-100 text-stone-700 text-xs font-bold border border-stone-200">
          <Users className="w-3.5 h-3.5 text-stone-600" />
          <span>Student Tracker</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
          {activeGrade.name} Student Tracker
        </h2>
        <p className="text-xs sm:text-sm text-stone-500 font-medium">
          Ready for custom configuration and new student tracking features.
        </p>
      </div>

      {/* Clean Slate Workspace */}
      <div className="p-16 text-center rounded-md bg-white border border-dashed border-stone-300 shadow-2xs space-y-4">
        <div className="w-14 h-14 rounded-md bg-stone-50 border border-stone-200 text-stone-400 flex items-center justify-center mx-auto">
          <Users className="w-7 h-7 text-stone-400" />
        </div>
        <div className="space-y-1.5 max-w-md mx-auto">
          <h3 className="text-base font-extrabold text-stone-900">
            Clean Canvas Ready
          </h3>
          <p className="text-xs text-stone-500 font-medium leading-relaxed">
            All previous student tracker features and legacy data have been removed. This workspace is ready for your completely new feature implementation.
          </p>
        </div>
      </div>
    </div>
  );
}
