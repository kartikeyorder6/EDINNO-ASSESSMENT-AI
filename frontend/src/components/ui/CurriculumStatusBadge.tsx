"use client";

import React from "react";
import { CheckCircle2, PlayCircle, PauseCircle, Clock } from "lucide-react";
import { CurriculumStatus } from "../../lib/curriculum-api";

export interface CurriculumStatusBadgeProps {
  status: CurriculumStatus | string;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

export function CurriculumStatusBadge({
  status,
  size = "md",
  showIcon = true,
  className = "",
}: CurriculumStatusBadgeProps) {
  const norm = status || "Not Started";

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[10px] gap-1"
      : "px-2.5 py-1 text-xs gap-1.5";

  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  switch (norm) {
    case "Done":
      return (
        <span
          className={`inline-flex items-center rounded font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 select-none ${sizeClasses} ${className}`}
        >
          {showIcon && <CheckCircle2 className={`${iconSize} text-emerald-600 shrink-0`} />}
          <span>Done</span>
        </span>
      );
    case "In Progress":
      return (
        <span
          className={`inline-flex items-center rounded font-bold bg-blue-50 text-blue-700 border border-blue-200 select-none ${sizeClasses} ${className}`}
        >
          {showIcon && <PlayCircle className={`${iconSize} text-blue-600 shrink-0`} />}
          <span>In Progress</span>
        </span>
      );
    case "On Hold":
      return (
        <span
          className={`inline-flex items-center rounded font-bold bg-amber-50 text-amber-700 border border-amber-200 select-none ${sizeClasses} ${className}`}
        >
          {showIcon && <PauseCircle className={`${iconSize} text-amber-600 shrink-0`} />}
          <span>On Hold</span>
        </span>
      );
    case "Not Started":
    default:
      return (
        <span
          className={`inline-flex items-center rounded font-bold bg-stone-100 text-stone-600 border border-stone-200 select-none ${sizeClasses} ${className}`}
        >
          {showIcon && <Clock className={`${iconSize} text-stone-400 shrink-0`} />}
          <span>Not Started</span>
        </span>
      );
  }
}

export default CurriculumStatusBadge;

