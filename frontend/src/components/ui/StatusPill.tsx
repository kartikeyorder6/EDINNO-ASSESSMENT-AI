"use client";

import React from "react";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";

interface StatusPillProps {
  status: "VERIFIED" | "PASSED" | "FAILED_QUIZ" | "FAILED" | "PENDING_QUIZ" | "PENDING" | string;
  label?: string;
  className?: string;
}

export function StatusPill({ status, label, className = "" }: StatusPillProps) {
  const norm = (status || "").toUpperCase();

  if (norm === "VERIFIED" || norm === "PASSED") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 ${className}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{label || "Verified"}</span>
      </span>
    );
  }

  if (norm === "FAILED_QUIZ" || norm === "FAILED") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 ${className}`}
      >
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{label || "Retry Required"}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 ${className}`}
    >
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>{label || "Pending Quiz"}</span>
    </span>
  );
}

export default StatusPill;
