import React from "react";
import {
  BookOpen,
  FlaskConical,
  Rocket,
  Layers,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  FileQuestion,
  ShieldCheck,
  Scale,
} from "lucide-react";
import { ResourceCategory } from "../types";

export interface CategoryTokenConfig {
  id: ResourceCategory;
  title: string;
  shortTitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: "blue" | "emerald" | "purple" | "slate";
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  hoverBorder: string;
  hoverGlow: string;
  lightBg: string;
  iconGradient: string;
  buttonStyle: string;
  hint: string;
  examples: string;
}

export const CATEGORY_TOKENS: Record<ResourceCategory, CategoryTokenConfig> = {
  topic: {
    id: "topic",
    title: "Topics",
    shortTitle: "Topics",
    icon: BookOpen,
    accentColor: "blue",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    borderColor: "border-blue-200/80",
    hoverBorder: "hover:border-blue-400",
    hoverGlow: "hover:shadow-blue-500/10",
    lightBg: "bg-blue-50/30",
    iconGradient: "from-blue-600 to-indigo-600 text-white",
    buttonStyle: "bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border-blue-200 hover:border-blue-600",
    hint: "Topic ebooks, lectures & theory",
    examples: "e.g. Chapter Lessons, Conceptual Guides, Lecture Slides",
  },
  activity: {
    id: "activity",
    title: "Activities",
    shortTitle: "Activities",
    icon: FlaskConical,
    accentColor: "emerald",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
    borderColor: "border-emerald-200/80",
    hoverBorder: "hover:border-emerald-400",
    hoverGlow: "hover:shadow-emerald-500/10",
    lightBg: "bg-emerald-50/30",
    iconGradient: "from-emerald-600 to-teal-600 text-white",
    buttonStyle: "bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border-emerald-200 hover:border-emerald-600",
    hint: "Lab sheets & practical exercises",
    examples: "e.g. Practical Worksheets, Lab Experiments, Hands-on Exercises",
  },
  project: {
    id: "project",
    title: "Projects",
    shortTitle: "Projects",
    icon: Rocket,
    accentColor: "purple",
    badgeBg: "bg-purple-100",
    badgeText: "text-purple-800",
    borderColor: "border-purple-200/80",
    hoverBorder: "hover:border-purple-400",
    hoverGlow: "hover:shadow-purple-500/10",
    lightBg: "bg-purple-50/30",
    iconGradient: "from-purple-600 to-violet-600 text-white",
    buttonStyle: "bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white border-purple-200 hover:border-purple-600",
    hint: "Capstone & hardware mini-projects",
    examples: "e.g. Capstone Assignments, Mini-Projects, Engineering Challenges",
  },
};

export interface QuestionTypeTokenConfig {
  label: string;
  badgeStyle: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const QUESTION_TYPE_TOKENS: Record<string, QuestionTypeTokenConfig> = {
  mcq: {
    label: "Multiple Choice",
    badgeStyle: "bg-blue-50 text-blue-700 border-blue-200",
    icon: FileQuestion,
  },
  true_false: {
    label: "True / False",
    badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
    icon: CheckCircle2,
  },
  situation: {
    label: "Scenario Problem",
    badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
    icon: Sparkles,
  },
  general: {
    label: "Short Answer",
    badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: HelpCircle,
  },
  matching: {
    label: "Matching",
    badgeStyle: "bg-cyan-50 text-cyan-700 border-cyan-200",
    icon: Layers,
  },
};

export interface BlueprintTokenConfig {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  tag: string;
  recommended?: boolean;
  badgeText?: string;
  badgeColor?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  defaultQuestionCount: number;
}

export const BLUEPRINT_TOKENS: BlueprintTokenConfig[] = [
  {
    id: "mixed",
    title: "Comprehensive Mixed Exam",
    subtitle: "10 Questions: 5 MCQs (incl. 2 Scenarios) + 5 T/F",
    desc: "Structured exam: 5 MCQs (including 2 scenario-based practical problems) and 5 conceptual True/False checks.",
    tag: "5 MCQs (2 Scenarios) • 5 T/F",
    recommended: true,
    badgeText: "Recommended",
    badgeColor: "bg-blue-600 text-white",
    icon: Layers,
    iconColor: "text-blue-600 bg-blue-50 border-blue-200",
    defaultQuestionCount: 10,
  },
  {
    id: "merged_conceptual",
    title: "Merged Curriculum Assessment",
    subtitle: "Pinouts, Components & Scenario Reasoning",
    desc: "Flagship exam: pin identification, roles, practical scenarios, and conceptual logic. Strictly zero code and schematics.",
    tag: "Flagship • Strict Guardrails",
    badgeText: "Flagship",
    badgeColor: "bg-indigo-600 text-white",
    icon: Sparkles,
    iconColor: "text-indigo-600 bg-indigo-50 border-indigo-200",
    defaultQuestionCount: 12,
  },
  {
    id: "pre_assembly",
    title: "Pre-Assembly Safety Check",
    subtitle: "Component ratings & hazard verification",
    desc: "3 rapid objective checks: 1 picture-based component/sensor identification + 2 simple readiness MCQs.",
    tag: "Lab Safety",
    badgeText: "Safety Gate",
    badgeColor: "bg-amber-600 text-white",
    icon: ShieldCheck,
    iconColor: "text-amber-600 bg-amber-50 border-amber-200",
    defaultQuestionCount: 3,
  },
  {
    id: "mcq",
    title: "Standardized Multiple Choice (MCQ)",
    subtitle: "4-option questions with detailed rationale",
    desc: "Single-correct answer questions with plausible distractors, misconception analysis, and curriculum references.",
    tag: "Objective Exam",
    badgeText: "Standard",
    badgeColor: "bg-emerald-600 text-white",
    icon: CheckCircle2,
    iconColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
    defaultQuestionCount: 10,
  },
  {
    id: "true_false",
    title: "Conceptual True / False Diagnostic",
    subtitle: "Hardware misconceptions & logic thresholds",
    desc: "Pinpoints subtle logic misunderstandings in pull-up resistors, digital thresholds, and ADC values.",
    tag: "Diagnostic",
    badgeText: "Diagnostic",
    badgeColor: "bg-purple-600 text-white",
    icon: HelpCircle,
    iconColor: "text-purple-600 bg-purple-50 border-purple-200",
    defaultQuestionCount: 10,
  },
  {
    id: "master_all",
    title: "Master Cross-Modular Capstone",
    subtitle: "Cross-modular integration assessment",
    desc: "Tests cross-discipline synergy between controllers, sensors, actuators, and integrated domain projects.",
    tag: "Capstone",
    badgeText: "Capstone",
    badgeColor: "bg-slate-700 text-white",
    icon: Scale,
    iconColor: "text-slate-700 bg-slate-100 border-slate-200",
    defaultQuestionCount: 15,
  },
];

export const BASEL_PALETTE = {
  navy: "#03195b",
  sapphire: "#0b2cb1",
  electric: "#1951fc",
  sky: "#3781fc",
  ice: "#cbe9fd",
  creamBg: "#FBF9F5",
  creamSurface: "#F4EFE6",
  creamBorder: "#EAE5D9",
} as const;

export const EDINNO_THEME = {
  colors: {
    brand: "#B81104",
    brandDark: "#8F0D03",
    brandDeep: "#720B02",
    brandLight: "#FEF2F2",
    accent: "#FFFACD",
    accentDark: "#F4E88C",
    accentLight: "#F9F1AE",
    bgIvory: "#FDFBF7",
    bgCream: "#FBF9F5",
    bgSurface: "#FFFFFF",
    surfaceMuted: "#F4EFE6",
    borderCream: "#EAE5D9",
    borderLight: "#F0ECE1",
    textPrimary: "#1C1917",
    textSecondary: "#57534E",
    textMuted: "#78716C",
  },
  classes: {
    btnPrimary:
      "inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-[#FFFACD] bg-[#B81104] hover:bg-[#8F0D03] active:bg-[#720B02] border border-[#8F0D03] shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
    btnSecondary:
      "inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-md text-xs sm:text-sm font-semibold text-stone-700 bg-white hover:bg-stone-50 active:bg-stone-100 border border-[#EAE5D9] shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
    btnGhost:
      "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100/70 transition-all cursor-pointer",
    btnAccent:
      "inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-md text-xs sm:text-sm font-bold text-[#8F0D03] bg-[#FFFACD] hover:bg-[#F9F1AE] border border-[#F4E88C] shadow-xs transition-all cursor-pointer",
    cardElevated:
      "bg-white rounded-lg border border-[#EAE5D9] shadow-xs hover:border-stone-300 transition-all",
    cardFlat:
      "bg-white/80 backdrop-blur-sm rounded-lg border border-[#EAE5D9] shadow-2xs",
    badgeBrand:
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#FFFACD] text-[#8F0D03] border border-[#F4E88C]",
    inputBase:
      "w-full px-3 py-2 rounded-md border border-stone-200 text-xs sm:text-sm font-medium text-stone-900 bg-white placeholder:text-stone-400 focus:outline-none focus:border-[#B81104] focus:ring-1 focus:ring-[#B81104]/20 transition-all",
    modalBackdrop:
      "fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150",
    modalDialog:
      "relative w-full rounded-lg bg-white border border-stone-200 shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150",
  },
} as const;



