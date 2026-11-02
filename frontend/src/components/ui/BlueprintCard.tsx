"use client";

import React from "react";
import { Check } from "lucide-react";
import { BlueprintTokenConfig } from "../../lib/design-tokens";

export interface BlueprintCardProps {
  blueprint: BlueprintTokenConfig;
  isSelected: boolean;
  onSelect: (id: string, defaultCount: number) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * BlueprintCard — Design System Component for Assessment Architecture Selection.
 *
 * Implements a three-layer token architecture:
 * - Primitive tokens: 8px radii, neutral slate palette, brand blue accents.
 * - Semantic tokens: interactive surface, active border, focus ring, contrast typography.
 * - Component tokens: 28px icon box, 18px check indicator, 2-line truncated description.
 */
function BlueprintCardComponent({
  blueprint,
  isSelected,
  onSelect,
  disabled = false,
  className = "",
}: BlueprintCardProps) {
  const Icon = blueprint.icon;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(blueprint.id, blueprint.defaultQuestionCount);
    }
  };

  return (
    <div
      role="radio"
      tabIndex={disabled ? -1 : 0}
      aria-checked={isSelected}
      aria-disabled={disabled}
      aria-label={`${blueprint.title}: ${blueprint.subtitle}`}
      onKeyDown={handleKeyDown}
      onClick={() => {
        if (!disabled) {
          onSelect(blueprint.id, blueprint.defaultQuestionCount);
        }
      }}
      className={`p-3 rounded-lg border transition-all text-left relative flex flex-col justify-between select-none ${
        disabled
          ? "opacity-50 cursor-not-allowed bg-slate-50 border-slate-200"
          : isSelected
          ? "border-[#B81104] bg-[#B81104]/[0.03] ring-1 ring-[#B81104]/30 shadow-xs cursor-pointer"
          : "border-[#EAE5D9] bg-white hover:border-stone-300 hover:bg-stone-50/40 shadow-2xs cursor-pointer"
      } focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#B81104] ${className}`}
    >
      <div>
        {/* Header Row: Icon, Title, and Selected Checkmark */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${blueprint.iconColor}`}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-xs truncate leading-snug">
                {blueprint.title}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium truncate">
                {blueprint.subtitle}
              </p>
            </div>
          </div>

          {isSelected && (
            <span className="w-4 h-4 rounded bg-[#B81104] text-[#FFFACD] flex items-center justify-center shrink-0">
              <Check className="w-2.5 h-2.5 stroke-[3]" />
            </span>
          )}
        </div>

        {/* Description Body */}
        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-2">
          {blueprint.desc}
        </p>
      </div>

      {/* Footer Meta Strip */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
        <span className="font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
          {blueprint.tag}
        </span>
        <span className={`font-semibold ${isSelected ? "text-[#B81104]" : "text-slate-400"}`}>
          {blueprint.defaultQuestionCount} Questions
        </span>
      </div>
    </div>
  );
}

export const BlueprintCard = React.memo(BlueprintCardComponent);
export default BlueprintCard;
