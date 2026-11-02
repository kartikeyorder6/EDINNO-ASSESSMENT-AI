"use client";

import React, { forwardRef, useEffect, useRef } from "react";
import { Check, Minus } from "lucide-react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "size"> {
  checked?: boolean;
  indeterminate?: boolean;
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "brand" | "blue" | "emerald" | "stone";
  containerClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      checked = false,
      indeterminate = false,
      onChange,
      disabled = false,
      label,
      description,
      size = "md",
      variant = "brand",
      className = "",
      containerClassName = "",
      id,
      ...props
    },
    forwardedRef
  ) => {
    const internalRef = useRef<HTMLInputElement>(null);
    const ref = (forwardedRef as React.RefObject<HTMLInputElement>) || internalRef;

    useEffect(() => {
      if (ref.current) {
        ref.current.indeterminate = Boolean(indeterminate);
      }
    }, [indeterminate, ref]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      onChange?.(e.target.checked, e);
    };

    const sizeBoxMap = {
      sm: "w-3.5 h-3.5 rounded-xs",
      md: "w-4 h-4 rounded-xs",
      lg: "w-5 h-5 rounded-sm",
    };

    const sizeIconMap = {
      sm: "w-2.5 h-2.5",
      md: "w-3 h-3",
      lg: "w-3.5 h-3.5",
    };

    const variantStyles = {
      brand: "bg-[#B81104] border-[#B81104] text-[#FFFACD]",
      blue: "bg-blue-600 border-blue-600 text-white",
      emerald: "bg-emerald-600 border-emerald-600 text-white",
      stone: "bg-stone-900 border-stone-900 text-white",
    };

    const isActive = checked || indeterminate;

    return (
      <label
        className={`inline-flex items-start gap-2 select-none cursor-pointer ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${containerClassName}`}
      >
        <span className="relative flex items-center justify-center shrink-0 mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            id={id}
            checked={checked}
            disabled={disabled}
            onChange={handleChange}
            className="sr-only"
            {...props}
          />
          <span
            className={`border transition-all flex items-center justify-center shadow-2xs ${
              sizeBoxMap[size]
            } ${
              isActive
                ? variantStyles[variant]
                : "bg-white border-stone-300 hover:border-stone-400"
            } ${disabled ? "bg-stone-100 border-stone-200" : ""} ${className}`}
          >
            {indeterminate ? (
              <Minus className={`${sizeIconMap[size]} stroke-[3]`} />
            ) : checked ? (
              <Check className={`${sizeIconMap[size]} stroke-[3]`} />
            ) : null}
          </span>
        </span>

        {(label || description) && (
          <span className="flex flex-col text-left">
            {label && (
              <span
                className={`font-semibold leading-tight text-stone-800 ${
                  size === "sm" ? "text-xs" : size === "lg" ? "text-sm" : "text-xs"
                }`}
              >
                {label}
              </span>
            )}
            {description && (
              <span className="text-[11px] text-stone-500 leading-tight mt-0.5">
                {description}
              </span>
            )}
          </span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";

