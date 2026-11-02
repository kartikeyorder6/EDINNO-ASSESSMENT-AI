"use client";

import React from "react";
import { QUESTION_TYPE_TOKENS } from "../../lib/design-tokens";

interface QuestionTypeBadgeProps {
  type: string;
  className?: string;
  showIcon?: boolean;
}

export function QuestionTypeBadge({
  type,
  className = "",
  showIcon = false,
}: QuestionTypeBadgeProps) {
  const normType = (type || "").toLowerCase();
  const config = QUESTION_TYPE_TOKENS[normType] || {
    label: normType.toUpperCase() || "QUESTION",
    badgeStyle: "bg-slate-50 text-slate-700 border-slate-200",
    icon: () => null,
  };
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-md border ${config.badgeStyle} ${className}`}
    >
      {showIcon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{config.label}</span>
    </span>
  );
}

export default QuestionTypeBadge;
