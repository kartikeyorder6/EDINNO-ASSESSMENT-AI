"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: {
    text: string;
    variant?: "blue" | "emerald" | "amber" | "purple" | "slate" | "gray";
  };
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export interface SelectDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  dropdownClassName?: string;
  size?: "xs" | "sm" | "md" | "lg";
  id?: string;
  error?: string;
}

const BADGE_VARIANTS: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
};

export function SelectDropdown({
  value,
  onChange,
  options,
  label,
  description,
  placeholder = "Select an option...",
  disabled = false,
  className = "",
  dropdownClassName = "",
  size = "md",
  id,
  error,
}: SelectDropdownProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      if (e.key === "ArrowDown" || e.key === "Down") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          const idx = options.findIndex((o) => o.value === value);
          setHighlightedIndex(idx >= 0 ? idx : 0);
        } else {
          setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        }
      } else if (e.key === "ArrowUp" || e.key === "Up") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          const idx = options.findIndex((o) => o.value === value);
          setHighlightedIndex(idx >= 0 ? idx : options.length - 1);
        } else {
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0 && highlightedIndex < options.length) {
          const opt = options[highlightedIndex];
          if (!opt.disabled) {
            onChange(opt.value);
            setIsOpen(false);
          }
        } else {
          setIsOpen((prev) => !prev);
          const idx = options.findIndex((o) => o.value === value);
          setHighlightedIndex(idx >= 0 ? idx : 0);
        }
      } else if (e.key === "Escape" || e.key === "Tab") {
        if (isOpen) {
          setIsOpen(false);
        }
      }
    },
    [disabled, isOpen, highlightedIndex, options, value, onChange]
  );

  // Auto-scroll highlighted option into view
  useEffect(() => {
    if (isOpen && listboxRef.current && highlightedIndex >= 0) {
      const items = listboxRef.current.querySelectorAll("li");
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const sizeStyles = {
    xs: "py-1 px-2.5 text-xs min-h-[30px]",
    sm: "py-1.5 px-2.5 text-xs min-h-[36px]",
    md: "py-2 px-3 text-xs sm:text-sm min-h-[42px]",
    lg: "py-2.5 px-3.5 text-sm sm:text-base min-h-[48px]",
  };

  const SelectedIcon = selectedOption?.icon;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label
          id={id ? `${id}-label` : undefined}
          htmlFor={id}
          className="block text-xs font-bold text-slate-700 mb-1.5 tracking-tight"
        >
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={label && id ? `${id}-label` : undefined}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => !prev);
            const idx = options.findIndex((o) => o.value === value);
            setHighlightedIndex(idx >= 0 ? idx : 0);
          }
        }}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between gap-2.5 rounded-md border bg-[#FBF9F5] text-left transition-all ${
          sizeStyles[size]
        } ${
          error
            ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
            : isOpen
            ? "border-[#B81104] bg-white ring-1 ring-[#B81104]/30 shadow-xs"
            : "border-[#EAE5D9] hover:border-slate-300 hover:bg-white"
        } ${disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "cursor-pointer"}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {SelectedIcon && (
            <SelectedIcon className="w-4 h-4 shrink-0 text-slate-600" />
          )}
          <span
            className="truncate font-medium text-slate-900 text-xs sm:text-[13px]"
            title={selectedOption ? selectedOption.label : placeholder}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span
              className={`hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                BADGE_VARIANTS[selectedOption.badge.variant || "blue"]
              }`}
            >
              {selectedOption.badge.text}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[#B81104]" : ""
          }`}
        />
      </button>

      {/* Floating Popover Panel */}
      {isOpen && (
        <div
          className={`absolute left-0 mt-1 z-50 min-w-full w-max max-w-[min(94vw,540px)] rounded-md border border-stone-200 bg-white shadow-2xl p-1 animate-in fade-in duration-100 origin-top ${dropdownClassName}`}
        >
          <ul
            ref={listboxRef}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={
              highlightedIndex >= 0 ? `opt-${id || "select"}-${highlightedIndex}` : undefined
            }
            className="max-h-64 overflow-y-auto space-y-0.5 focus:outline-none"
          >
            {options.map((opt, index) => {
              const isSelected = opt.value === value;
              const isHighlighted = highlightedIndex === index;
              const OptIcon = opt.icon;

              return (
                <li
                  key={opt.value}
                  id={`opt-${id || "select"}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => {
                    if (!opt.disabled) {
                      onChange(opt.value);
                      setIsOpen(false);
                    }
                  }}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded transition-colors cursor-pointer text-xs ${
                    opt.disabled
                      ? "opacity-40 cursor-not-allowed bg-transparent"
                      : isSelected
                      ? "bg-[#B81104]/5 text-[#8F0D03] font-bold"
                      : isHighlighted
                      ? "bg-stone-100 text-stone-900"
                      : "text-slate-700 hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {OptIcon && (
                      <div className="pt-0.5">
                        <OptIcon
                          className={`w-4 h-4 shrink-0 ${
                            isSelected ? "text-[#B81104]" : "text-slate-500"
                          }`}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-semibold leading-snug break-words whitespace-normal text-left"
                          title={opt.label}
                        >
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 ${
                              BADGE_VARIANTS[opt.badge.variant || "blue"]
                            }`}
                          >
                            {opt.badge.text}
                          </span>
                        )}
                      </div>
                      {opt.sublabel && (
                        <p className="text-[11px] text-slate-500 mt-0.5 font-normal leading-normal break-words">
                          {opt.sublabel}
                        </p>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 shrink-0 text-[#B81104] ml-2" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {description && !error && (
        <p className="text-[11px] text-slate-500 mt-1 font-normal tracking-tight">
          {description}
        </p>
      )}

      {error && (
        <p className="text-[11px] text-red-600 mt-1 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

export default SelectDropdown;
