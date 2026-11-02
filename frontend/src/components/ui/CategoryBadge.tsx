"use client";

import React from "react";
import { ResourceCategory } from "../../types";
import { CATEGORY_TOKENS } from "../../lib/design-tokens";

interface CategoryBadgeProps {
  category: ResourceCategory | string;
  count?: number;
  showIcon?: boolean;
  className?: string;
}

export function CategoryBadge({
  category,
  count,
  showIcon = true,
  className = "",
}: CategoryBadgeProps) {
  const normCat = (category || "").toLowerCase() as ResourceCategory;
  const config = CATEGORY_TOKENS[normCat] || CATEGORY_TOKENS.topic;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${config.badgeBg} ${config.badgeText} ${config.borderColor} ${className}`}
    >
      {showIcon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{config.shortTitle}</span>
      {count !== undefined && <span className="opacity-75 tabular-nums">({count})</span>}
    </span>
  );
}

export default CategoryBadge;
