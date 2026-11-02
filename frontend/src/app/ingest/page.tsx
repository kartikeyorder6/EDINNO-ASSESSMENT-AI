"use client";

import React, { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "../../lib/store";
import { uploadCurriculumPdfs } from "../../lib/api";
import { uploadCloudinaryPdf } from "../../lib/cloudinary-api";
import { parseCurriculumFilename } from "../../lib/curriculum-api";
import { ResourceCategory, CloudinaryAsset } from "../../types";
import PreAssemblyQuiz from "../../components/PreAssemblyQuiz";
import { SelectDropdown, SelectOption, Checkbox } from "../../components/ui";
import { AppHeader } from "../../components/layout/AppHeader";
import StepProgress from "../../components/StepProgress";
import { CurriculumPdfManager } from "../../features/curriculum/components/CurriculumPdfManager";
import {
  UploadCloud,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Trash2,
  FilePlus,
  BookOpen,
  FlaskConical,
  Rocket,
  Columns3,
  LayoutGrid,
  ShieldAlert,
  Lock,
  Cloud,
  FolderOpen,
  Loader2,
} from "lucide-react";

interface StagedFile {
  key: string;
  file: File;
  name: string;
  size: number;
  title: string;
  category: ResourceCategory;
  chapter: string;
  grade: number;
  sequence: number;
  nomenclatureId: string;
}

const CATEGORY_META: Record<
  ResourceCategory,
  {
    title: string;
    shortTitle: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
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
> = {
  topic: {
    title: "Topics",
    shortTitle: "Topics",
    icon: BookOpen,
    accentColor: "blue",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    borderColor: "border-blue-200/80",
    hoverBorder: "hover:border-blue-400",
    hoverGlow: "hover:shadow-blue-500/10",
    lightBg: "bg-blue-50/25",
    iconGradient: "from-blue-600 to-indigo-600 text-white",
    buttonStyle: "bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border-blue-200 hover:border-blue-600",
    hint: "Topic ebooks, lectures & theory",
    examples: "e.g. Chapter Lessons, Conceptual Guides, Lecture Slides",
  },
  activity: {
    title: "Activities",
    shortTitle: "Activities",
    icon: FlaskConical,
    accentColor: "emerald",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
    borderColor: "border-emerald-200/80",
    hoverBorder: "hover:border-emerald-400",
    hoverGlow: "hover:shadow-emerald-500/10",
    lightBg: "bg-emerald-50/25",
    iconGradient: "from-emerald-600 to-teal-600 text-white",
    buttonStyle: "bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border-emerald-200 hover:border-emerald-600",
    hint: "Lab sheets & practical exercises",
    examples: "e.g. Practical Worksheets, Lab Experiments, Hands-on Exercises",
  },
  project: {
    title: "Projects",
    shortTitle: "Projects",
    icon: Rocket,
    accentColor: "purple",
    badgeBg: "bg-purple-100",
    badgeText: "text-purple-800",
    borderColor: "border-purple-200/80",
    hoverBorder: "hover:border-purple-400",
    hoverGlow: "hover:shadow-purple-500/10",
    lightBg: "bg-purple-50/25",
    iconGradient: "from-purple-600 to-violet-600 text-white",
    buttonStyle: "bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white border-purple-200 hover:border-purple-600",
    hint: "Capstone & hardware mini-projects",
    examples: "e.g. Capstone Assignments, Mini-Projects, Engineering Challenges",
  },
};

const CATEGORIES: ResourceCategory[] = ["topic", "activity", "project"];

export default function UploadPage() {
  const router = useRouter();
  const { setExtractedData } = useAssessment();

  const [stagedFiles, setStagedFiles] = useState<Record<string, StagedFile>>({});
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
  const [isDraggingUniversal, setIsDraggingUniversal] = useState<boolean>(false);
  const [draggingCategory, setDraggingCategory] = useState<ResourceCategory | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<"chapter_quiz" | "pre_assembly">("chapter_quiz");
  const [selectedFilterTab, setSelectedFilterTab] = useState<string>("all");
  const [viewLayout, setViewLayout] = useState<"columns" | "grid">("columns");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveToCloudinary, setSaveToCloudinary] = useState<boolean>(true);
  const [isPdfStorageOpen, setIsPdfStorageOpen] = useState<boolean>(false);

  // Grade selection mode: "auto" | 6..12
  const [selectedGradeMode, setSelectedGradeMode] = useState<"auto" | number>("auto");

  // Chapter selection mode: "auto" | "custom" | predefined string
  const [selectedChapterMode, setSelectedChapterMode] = useState<string>("auto");
  const [customChapterName, setCustomChapterName] = useState<string>("");

  // Category sorting mode: "auto" | "topic" | "activity" | "project"
  const [categorySortingMode, setCategorySortingMode] = useState<"auto" | ResourceCategory>("auto");

  const universalInputRef = useRef<HTMLInputElement>(null);
  const fileInputRefs: Record<ResourceCategory, React.RefObject<HTMLInputElement | null>> = {
    topic: useRef<HTMLInputElement>(null),
    activity: useRef<HTMLInputElement>(null),
    project: useRef<HTMLInputElement>(null),
  };

  // Grade dropdown options
  const gradeOptions: SelectOption[] = useMemo(() => [
    {
      value: "auto",
      label: "⚡ Auto-detect Grade per file (Smart)",
      badge: { text: "Smart AI", variant: "emerald" },
    },
    ...[6, 7, 8, 9, 10, 11, 12].map((g) => ({
      value: String(g),
      label: `Grade ${g}`,
    })),
  ], []);

  // Chapter dropdown options
  const chapterOptions: SelectOption[] = useMemo(() => [
    {
      value: "auto",
      label: "⚡ Auto-detect Chapter from files (Smart)",
      sublabel: "Extracts chapter from filename or folder pattern",
      badge: { text: "Smart AI", variant: "emerald" },
    },
    { value: "Chapter 1", label: "Chapter 1: Foundations" },
    { value: "Chapter 2", label: "Chapter 2: Sensors & Actuators" },
    { value: "Chapter 3", label: "Chapter 3: Control & Microcontrollers" },
    { value: "Chapter 4", label: "Chapter 4: Communication & Displays" },
    { value: "Chapter 5", label: "Chapter 5: Capstone Systems" },
    {
      value: "custom",
      label: "✏️ Custom Chapter Title...",
      sublabel: "Enter custom chapter name below",
      badge: { text: "Custom", variant: "amber" },
    },
  ], []);

  // Category sorting mode options
  const categoryModeOptions: SelectOption[] = useMemo(() => [
    {
      value: "auto",
      label: "⚡ Auto-Sort Categories (Smart AI)",
      sublabel: "Automatically sorts into Topics, Activities, and Projects",
      badge: { text: "Recommended", variant: "emerald" },
    },
    { value: "topic", label: "Force All: 📘 Topics" },
    { value: "activity", label: "Force All: 🔬 Activities" },
    { value: "project", label: "Force All: 🚀 Projects" },
  ], []);

  const addFiles = (filesArr: File[], forcedCategory?: ResourceCategory) => {
    const updated = { ...stagedFiles };
    let firstDerivedChapter = customChapterName;

    filesArr.forEach((f) => {
      if (f.name.toLowerCase().endsWith(".pdf")) {
        const cleanKey = f.name.replace(/\.pdf$/i, "").trim();

        // Run Smart AI Nomenclature Parser
        const parsed = parseCurriculumFilename(f.name, {
          currentGrade: selectedGradeMode === "auto" ? undefined : Number(selectedGradeMode),
          currentChapter:
            selectedChapterMode === "auto"
              ? undefined
              : selectedChapterMode === "custom"
              ? customChapterName || undefined
              : selectedChapterMode,
        });

        // Determine category based on forced parameter, global mode, or smart AI parsing
        let resolvedCategory: ResourceCategory = "topic";
        if (forcedCategory) {
          resolvedCategory = forcedCategory;
        } else if (categorySortingMode !== "auto") {
          resolvedCategory = categorySortingMode;
        } else {
          resolvedCategory = parsed.category.toLowerCase() as ResourceCategory;
        }

        const resolvedGrade = selectedGradeMode === "auto" ? parsed.grade : Number(selectedGradeMode);
        const resolvedChapter =
          selectedChapterMode === "auto"
            ? parsed.chapter
            : selectedChapterMode === "custom"
            ? customChapterName.trim() || parsed.chapter
            : selectedChapterMode;

        if (!firstDerivedChapter && parsed.chapter && parsed.chapter !== "General Curriculum") {
          firstDerivedChapter = parsed.chapter;
        }

        updated[cleanKey] = {
          key: cleanKey,
          file: f,
          name: f.name,
          size: f.size,
          title: parsed.documentTitle || cleanKey,
          category: resolvedCategory,
          chapter: resolvedChapter,
          grade: resolvedGrade,
          sequence: parsed.sequence,
          nomenclatureId: parsed.nomenclatureId,
        };
      }
    });

    setStagedFiles(updated);
    if (firstDerivedChapter && !customChapterName) {
      setCustomChapterName(firstDerivedChapter);
    }
  };

  const handleUniversalDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingUniversal(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleCategoryDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetCategory: ResourceCategory
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingCategory(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files), targetCategory);
    }
  };

  const removeFile = (key: string) => {
    const updated = { ...stagedFiles };
    delete updated[key];
    setStagedFiles(updated);
  };

  const changeCategory = (key: string, newCategory: ResourceCategory) => {
    if (!stagedFiles[key]) return;
    setStagedFiles({
      ...stagedFiles,
      [key]: {
        ...stagedFiles[key],
        category: newCategory,
      },
    });
  };

  const handleCategoryFileInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    category: ResourceCategory
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files), category);
      e.target.value = "";
    }
  };

  const stagedList = Object.values(stagedFiles);
  const totalFiles = stagedList.length;
  const totalSizeBytes = stagedList.reduce((acc, sf) => acc + sf.size, 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);

  const countByCategory = (cat: ResourceCategory) =>
    stagedList.filter((f) => f.category === cat).length;

  const topicCount = countByCategory("topic");
  const activityCount = countByCategory("activity");
  const projectCount = countByCategory("project");

  const filteredStagedList = stagedList.filter((item) => {
    if (selectedFilterTab === "all") return true;
    return item.category === selectedFilterTab;
  });

  const activeChapterLabel =
    selectedChapterMode === "custom"
      ? customChapterName.trim() || "Custom Chapter"
      : selectedChapterMode === "auto"
      ? stagedList[0]?.chapter || "Auto-detecting from files"
      : selectedChapterMode;

  const handleExtractAndProceed = async () => {
    if (totalFiles === 0) {
      setErrorMsg("Please upload at least one PDF curriculum document.");
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setUploadProgressText("Processing curriculum assets...");

    try {
      // 1. Dual Save: Archive to Cloudinary Storage if enabled
      if (saveToCloudinary) {
        setUploadProgressText(`Archiving ${totalFiles} PDF(s) to Cloud Storage...`);
        for (let i = 0; i < stagedList.length; i++) {
          const sf = stagedList[i];
          setUploadProgressText(
            `Uploading ${i + 1}/${totalFiles}: ${sf.title}...`
          );
          try {
            await uploadCloudinaryPdf({
              file: sf.file,
              grade: sf.grade,
              chapter: sf.chapter,
              category: sf.category.charAt(0).toUpperCase() + sf.category.slice(1),
              title: sf.title,
              overwrite: true,
            });
          } catch (cloudErr) {
            console.warn(`Cloudinary archive notice for ${sf.name}:`, cloudErr);
          }
        }
      }

      // 2. OCR Extraction for Assessment Studio
      setUploadProgressText("Extracting curriculum specifications for AI engine...");
      const filesToUpload = stagedList.map((sf) => sf.file);
      const categoryMap: Record<string, string> = {};
      stagedList.forEach((sf) => {
        categoryMap[sf.file.name] = sf.category;
        categoryMap[sf.key] = sf.category;
      });

      const resp = await uploadCurriculumPdfs(filesToUpload, categoryMap);
      const finalChapter =
        selectedChapterMode === "custom" && customChapterName.trim()
          ? customChapterName.trim()
          : stagedList[0]?.chapter || "Curriculum Unit";

      setExtractedData(resp.resources, resp.metadata, finalChapter);
      router.push("/merge");
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErrorMsg(
        err.message ||
          "Failed to extract PDF content. Please ensure the backend is running."
      );
    } finally {
      setIsUploading(false);
      setUploadProgressText(null);
    }
  };

  const handleSelectAssetForAssessment = (assetOrAssets: CloudinaryAsset | CloudinaryAsset[]) => {
    setIsPdfStorageOpen(false);
    const asset = Array.isArray(assetOrAssets) ? assetOrAssets[0] : assetOrAssets;
    if (asset?.grade) {
      router.push(`/studio?grade=${asset.grade}&assetId=${encodeURIComponent(asset.id)}`);
    } else {
      router.push("/studio");
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <AppHeader activePage="ingest" />
      <StepProgress currentStep={1} />

      <main className="max-w-7xl xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
        {/* =========================================================
            WORKFLOW SELECTION DECK (Pre-Assembly, Chapter Quiz, Master Assessment)
            ========================================================= */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 px-1">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span>Choose Assessment Workflow</span>
              </h2>
              <p className="text-xs text-slate-500">
                Select your assessment pathway: mandatory project pre-assembly check or full chapter curriculum suite.
              </p>
            </div>
            {totalFiles > 0 && (
              <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded shadow-2xs self-start sm:self-auto">
                {totalFiles} Curriculum PDF{totalFiles > 1 ? "s" : ""} Staged ({totalSizeMB} MB)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Pre-Assembly Quiz */}
            <div
              onClick={() => setActiveWorkflow("pre_assembly")}
              className={`p-4.5 sm:p-5 rounded-md border transition-all duration-200 cursor-pointer flex flex-col justify-between relative group ${
                activeWorkflow === "pre_assembly"
                  ? "bg-white border-red-500 ring-2 ring-red-500/20 shadow-md scale-[1.01]"
                  : "bg-[#FBF9F5] border-[#EAE5D9] hover:border-slate-300 hover:bg-white shadow-2xs"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-red-600 to-rose-600 text-white flex items-center justify-center font-bold shadow-xs">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                    Mandatory Check
                  </span>
                </div>
                <h3 className="font-extrabold text-slate-900 text-base mb-1 group-hover:text-red-600 transition-colors">
                  Pre-Assembly Quiz
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Component readiness & pinout safety verification linked to your selected project. Users must complete it before proceeding to assembly.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className={`font-bold ${activeWorkflow === "pre_assembly" ? "text-red-600" : "text-slate-600 group-hover:text-red-600"}`}>
                  {activeWorkflow === "pre_assembly" ? "● Active Workflow" : "Open Pre-Assembly Quiz →"}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">5 Questions • 80% Pass</span>
              </div>
            </div>

            {/* Card 2: Chapter Quiz */}
            <div
              onClick={() => setActiveWorkflow("chapter_quiz")}
              className={`p-4.5 sm:p-5 rounded-md border transition-all duration-200 cursor-pointer flex flex-col justify-between relative group ${
                activeWorkflow === "chapter_quiz"
                  ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-md scale-[1.01]"
                  : "bg-[#FBF9F5] border-[#EAE5D9] hover:border-slate-300 hover:bg-white shadow-2xs"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Full Curriculum
                  </span>
                </div>
                <h3 className="font-extrabold text-slate-900 text-base mb-1 group-hover:text-blue-600 transition-colors">
                  Chapter Quiz
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Quizzes linked to chapter topics, activities, projects, and learning resources, with relevant questions and progress tracking.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className={`font-bold ${activeWorkflow === "chapter_quiz" ? "text-blue-600" : "text-slate-600 group-hover:text-blue-600"}`}>
                  {activeWorkflow === "chapter_quiz" ? "● Active Workflow" : "Open Chapter Ingestion →"}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Topics, Labs & Capstones</span>
              </div>
            </div>

            {/* Card 3: Master Assessment (Coming Soon) */}
            <div
              className="p-4.5 sm:p-5 rounded-md border border-dashed border-slate-300 bg-slate-50/70 opacity-70 cursor-not-allowed flex flex-col justify-between relative select-none"
              title="Master Assessment is coming soon and disabled until implemented."
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="w-9 h-9 rounded-md bg-slate-200 text-slate-600 flex items-center justify-center font-bold shadow-2xs">
                    <Lock className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700 border border-slate-300">
                    Coming Soon
                  </span>
                </div>
                <h3 className="font-extrabold text-slate-700 text-base mb-1">
                  Master Assessment
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Multi-chapter cumulative assessment and institutional item bank engine. Automatically compiles cross-domain grade-level examinations.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Disabled
                </span>
                <span className="text-[11px] text-slate-400 italic">Next Release</span>
              </div>
            </div>
          </div>
        </div>

        {/* RENDER ACTIVE WORKFLOW VIEW */}
        {activeWorkflow === "pre_assembly" ? (
          <PreAssemblyQuiz />
        ) : (
          <>
            {/* Real Staged Curriculum Summary Bar with Dynamic Category Pills */}
            {totalFiles > 0 && (
              <div className="bg-[#FBF9F5] border border-[#EAE5D9] rounded-md p-3.5 sm:p-4 mb-5 shadow-2xs animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">
                      {activeChapterLabel}
                    </span>
                    <span className="text-slate-300">•</span>
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        📘 {topicCount} Topics
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        🔬 {activityCount} Activities
                      </span>
                      <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                        🚀 {projectCount} Projects
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Batch Payload:</span>
                    <strong className="text-blue-700 font-bold">
                      {totalFiles} Document{totalFiles > 1 ? "s" : ""} • {totalSizeMB} MB
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* SaaS Compact Ingestion Header & Command Hub */}
            <div className="bg-white border border-[#EAE5D9] rounded-md p-4 sm:p-4.5 shadow-2xs mb-5 transition-all">
              {/* Top compact line: Step + Title + Metrics + Browse Stored PDFs shortcut */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200/80 text-[11px] font-bold text-blue-700">
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    <span>Step 1 of 4</span>
                  </span>
                  <span className="text-slate-300">/</span>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    Curriculum Ingestion Hub
                  </h1>
                  <span className="hidden md:inline text-xs text-slate-400 font-normal">
                    — Organize syllabus PDFs for AI assessment generation
                  </span>
                </div>

                {/* Right side: Browse Stored PDFs + Metrics capsule */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPdfStorageOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold text-[#B81104] bg-red-50 hover:bg-red-100/80 border border-red-200 shadow-2xs transition-colors cursor-pointer"
                    title="Open Cloudinary PDF Storage Manager to view or attach stored PDFs"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Browse Stored PDFs ➔</span>
                  </button>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="px-2.5 py-1 rounded bg-blue-50/70 border border-blue-100 text-blue-700 font-bold">
                      {totalFiles} <span className="font-normal text-blue-600/80">PDFs</span>
                    </span>
                    <span className="px-2.5 py-1 rounded bg-slate-50 border border-slate-200/80 text-slate-700 font-bold">
                      {totalSizeMB} <span className="font-normal text-slate-500">MB</span>
                    </span>
                    <span className="px-2.5 py-1 rounded bg-emerald-50/70 border border-emerald-100 text-emerald-700 font-bold">
                      {CATEGORIES.filter((c) => countByCategory(c) > 0).length}/3{" "}
                      <span className="font-normal text-emerald-600/80">Categories</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Triple Controls Row: Target Grade, Curriculum Chapter, and Category Sorting Mode */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 pb-3 border-b border-slate-100 bg-stone-50/60 p-3 rounded-md mt-3">
                {/* 1. Target Grade */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Target Grade
                  </label>
                  <SelectDropdown
                    size="sm"
                    value={String(selectedGradeMode)}
                    onChange={(val) =>
                      setSelectedGradeMode(val === "auto" ? "auto" : parseInt(val, 10))
                    }
                    options={gradeOptions}
                  />
                </div>

                {/* 2. Curriculum Chapter */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Curriculum Chapter / Unit
                  </label>
                  <SelectDropdown
                    size="sm"
                    value={selectedChapterMode}
                    onChange={(val) => setSelectedChapterMode(val)}
                    options={chapterOptions}
                  />
                  {selectedChapterMode === "custom" && (
                    <input
                      type="text"
                      placeholder="e.g. Chapter 4: Power Systems"
                      value={customChapterName}
                      onChange={(e) => setCustomChapterName(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1 text-xs font-semibold rounded border border-stone-300 bg-white focus:outline-hidden focus:border-[#B81104]"
                    />
                  )}
                </div>

                {/* 3. Category Sorting Mode */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Category Sorting Mode
                  </label>
                  <SelectDropdown
                    size="sm"
                    value={categorySortingMode}
                    onChange={(val) => setCategorySortingMode(val as "auto" | ResourceCategory)}
                    options={categoryModeOptions}
                  />
                </div>
              </div>

              {/* Slim Universal Dropzone */}
              <div className="pt-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingUniversal(true);
                  }}
                  onDragLeave={() => setIsDraggingUniversal(false)}
                  onDrop={handleUniversalDrop}
                  onClick={() => universalInputRef.current?.click()}
                  className={`border-2 border-dashed rounded px-4 py-3 flex items-center justify-between gap-3 transition-all duration-150 cursor-pointer ${
                    isDraggingUniversal
                      ? "border-blue-600 bg-blue-50 scale-[1.01]"
                      : "border-blue-200/90 bg-blue-50/25 hover:bg-blue-50/60 hover:border-blue-300"
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    title=""
                    tabIndex={-1}
                    ref={universalInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        addFiles(Array.from(e.target.files));
                        e.target.value = "";
                      }
                    }}
                    className="hidden"
                  />

                  <div className="flex items-center gap-2.5 min-w-0">
                    <UploadCloud className="w-5 h-5 text-blue-600 shrink-0" />
                    <div>
                      <span className="text-xs sm:text-sm font-semibold text-slate-800">
                        {isDraggingUniversal
                          ? "Release to upload and auto-classify..."
                          : "Drop curriculum PDFs here or browse"}
                      </span>
                      <p className="text-[11px] text-slate-400">
                        Supports bulk upload across Grades 6–12. Auto-classifies Topics, Activities, and Projects.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      universalInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-blue-200 text-xs font-bold text-blue-700 shadow-2xs hover:border-blue-400 hover:shadow-xs transition-all shrink-0 cursor-pointer"
                  >
                    <FilePlus className="w-3.5 h-3.5" />
                    <span>Browse Files</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Exactly 3-Category Prominent Interactive Pipeline Deck */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4 px-1">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Curriculum Category Buckets</h2>
                  <p className="text-xs text-slate-500">
                    Drag &amp; drop PDFs directly into any category card, or click &ldquo;+ Add&rdquo; to browse for that specific section.
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded shadow-2xs">
                  {CATEGORIES.filter((c) => countByCategory(c) > 0).length} of 3 Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {CATEGORIES.map((catKey) => {
                  const config = CATEGORY_META[catKey];
                  const Icon = config.icon;
                  const count = countByCategory(catKey);
                  const isTargetDragging = draggingCategory === catKey;

                  return (
                    <div
                      key={catKey}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDraggingCategory(catKey);
                      }}
                      onDragLeave={() => setDraggingCategory(null)}
                      onDrop={(e) => handleCategoryDrop(e, catKey)}
                      className={`bg-white border rounded-md p-6 sm:p-7 flex flex-col justify-between min-h-[270px] transition-all duration-200 relative group card-interactive ${
                        isTargetDragging
                          ? "border-blue-600 bg-blue-50/70 scale-[1.03] shadow-xl shadow-blue-500/15 ring-2 ring-blue-500"
                          : `${config.borderColor} ${config.hoverBorder} ${config.hoverGlow} shadow-xs`
                      }`}
                    >
                      <div>
                        {/* Top card row: Big Icon + Count Pill */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div
                            className={`w-13 h-13 rounded-md flex items-center justify-center font-bold shadow-xs bg-gradient-to-tr ${config.iconGradient} group-hover:scale-105 transition-transform duration-200`}
                          >
                            <Icon className="w-6 h-6" />
                          </div>

                          <span
                            className={`text-xs font-black px-3 py-1 rounded transition-all duration-200 ${
                              count > 0
                                ? "bg-slate-900 text-white shadow-xs scale-105"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {count} {count === 1 ? "PDF" : "PDFs"}
                          </span>
                        </div>

                        {/* Title & description */}
                        <h3 className="font-extrabold text-slate-900 text-base sm:text-lg leading-tight group-hover:text-blue-600 transition-colors">
                          {config.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {config.hint}
                        </p>

                        <div className="mt-3 text-[11px] font-mono text-slate-400 line-clamp-1 italic">
                          {config.examples}
                        </div>
                      </div>

                      {/* Bottom button with clean hidden file input */}
                      <div className="pt-5 mt-4 border-t border-slate-100">
                        <input
                          type="file"
                          ref={fileInputRefs[catKey]}
                          multiple
                          accept=".pdf"
                          title=""
                          tabIndex={-1}
                          onChange={(e) => handleCategoryFileInput(e, catKey)}
                          className="hidden"
                        />

                        <button
                          type="button"
                          onClick={() => fileInputRefs[catKey].current?.click()}
                          className={`w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-md border text-xs font-bold transition-all duration-200 cursor-pointer shadow-2xs active:scale-[0.98] ${config.buttonStyle}`}
                        >
                          <FilePlus className="w-4 h-4" />
                          <span>+ Add {config.shortTitle} PDFs</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Staged Documents Section */}
            {totalFiles > 0 && (
              <div className="bg-white border border-[#EAE5D9] rounded-md p-5 sm:p-6 shadow-xs mb-8 transition-all animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm shadow-2xs">
                      ✓
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">
                        Staged Curriculum Assets ({totalFiles} Documents)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Smart AI parsed nomenclature. Change bucket or target chapter dynamically.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto">
                    {/* View Layout Toggle: 3 Category Columns vs 3-Column Grid */}
                    <div className="flex items-center bg-[#FBF9F5] border border-[#EAE5D9] p-0.5 rounded-md text-xs">
                      <button
                        type="button"
                        onClick={() => setViewLayout("columns")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
                          viewLayout === "columns"
                            ? "bg-white text-blue-700 shadow-2xs border border-blue-200"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <Columns3 className="w-3.5 h-3.5" />
                        <span>3 Category Columns</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewLayout("grid")}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-bold transition-all cursor-pointer ${
                          viewLayout === "grid"
                            ? "bg-white text-blue-700 shadow-2xs border border-blue-200"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>3-Column Grid</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setStagedFiles({})}
                      className="text-xs text-slate-400 hover:text-red-600 font-semibold transition-colors cursor-pointer px-3 py-1.5 rounded hover:bg-red-50"
                    >
                      Clear All Files
                    </button>
                  </div>
                </div>

                {viewLayout === "columns" ? (
                  <div>
                    {/* Three Columns Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                      {CATEGORIES.map((catKey) => {
                        const config = CATEGORY_META[catKey];
                        const Icon = config.icon;
                        const catItems = stagedList.filter((f) => f.category === catKey);
                        const catBytes = catItems.reduce((acc, f) => acc + f.size, 0);
                        const catSizeMB = (catBytes / (1024 * 1024)).toFixed(2);
                        const isTargetDragging = draggingCategory === catKey;

                        return (
                          <div
                            key={catKey}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDraggingCategory(catKey);
                            }}
                            onDragLeave={() => setDraggingCategory(null)}
                            onDrop={(e) => handleCategoryDrop(e, catKey)}
                            className={`bg-[#FBF9F5] border rounded-md p-4 flex flex-col justify-between transition-all duration-200 ${
                              isTargetDragging
                                ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-400/20 shadow-md"
                                : `${config.borderColor} hover:border-slate-300 shadow-2xs`
                            }`}
                          >
                            <div>
                              {/* Column Header */}
                              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-8 h-8 rounded-md flex items-center justify-center font-bold shadow-2xs bg-gradient-to-tr ${config.iconGradient}`}
                                  >
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-slate-900 text-sm">
                                      {config.title}
                                    </h4>
                                    <p className="text-[11px] text-slate-400">
                                      {catSizeMB} MB Total
                                    </p>
                                  </div>
                                </div>
                                <span
                                  className={`text-xs font-black px-2.5 py-0.5 rounded ${
                                    catItems.length > 0
                                      ? "bg-slate-900 text-white shadow-2xs"
                                      : "bg-slate-200 text-slate-500"
                                  }`}
                                >
                                  {catItems.length} {catItems.length === 1 ? "File" : "Files"}
                                </span>
                              </div>

                              {/* List of individual cards inside this column */}
                              <div className="space-y-2.5 min-h-[120px]">
                                {catItems.length === 0 ? (
                                  <div className="border border-dashed border-slate-300 rounded-md p-6 text-center text-slate-400 text-xs">
                                    <p className="font-semibold text-slate-600">
                                      No {config.title} Staged
                                    </p>
                                    <p className="text-[11px] mt-0.5">
                                      Drag & drop {config.shortTitle.toLowerCase()} PDFs here
                                    </p>
                                  </div>
                                ) : (
                                  catItems.map((item) => {
                                    const fileSizeMB = (item.size / (1024 * 1024)).toFixed(2);
                                    return (
                                      <div
                                        key={item.key}
                                        className="p-3.5 rounded-md bg-white border border-[#EAE5D9] hover:border-blue-400 hover:shadow-xs transition-all duration-200 group flex flex-col justify-between gap-2.5 shadow-2xs"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                            <div
                                              className={`w-7 h-7 rounded flex items-center justify-center shrink-0 font-bold text-[10px] ${config.badgeBg} ${config.badgeText} shadow-2xs mt-0.5`}
                                            >
                                              PDF
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <h5
                                                className="font-bold text-slate-900 text-xs leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors"
                                                title={item.name}
                                              >
                                                {item.title}
                                              </h5>
                                              <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                                                {item.name}
                                              </p>
                                              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                                <span className="px-1.5 py-0.2 rounded bg-stone-100 font-bold text-stone-700 text-[10px]">
                                                  Grade {item.grade}
                                                </span>
                                                <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-mono text-[10px]">
                                                  {item.nomenclatureId}
                                                </span>
                                                <span>•</span>
                                                <span>{fileSizeMB} MB</span>
                                              </div>
                                            </div>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => removeFile(item.key)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer shrink-0"
                                            title="Remove file"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                                          <span className="text-slate-400 font-medium shrink-0">Bucket:</span>
                                          <div className="w-32">
                                            <SelectDropdown
                                              size="xs"
                                              value={item.category}
                                              onChange={(val) =>
                                                changeCategory(item.key, val as ResourceCategory)
                                              }
                                              options={[
                                                { value: "topic", label: "Topic" },
                                                { value: "activity", label: "Activity" },
                                                { value: "project", label: "Project" },
                                              ]}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* Column Bottom Action */}
                            <div className="pt-3 mt-4 border-t border-slate-200/70">
                              <button
                                type="button"
                                onClick={() => fileInputRefs[catKey].current?.click()}
                                className={`w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded border text-xs font-bold transition-all duration-150 cursor-pointer shadow-2xs ${config.buttonStyle}`}
                              >
                                <FilePlus className="w-3.5 h-3.5" />
                                <span>+ Add {config.shortTitle} PDF</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Filter tabs for Grid View */}
                    <div className="flex flex-wrap items-center gap-2 mb-5">
                      <button
                        type="button"
                        onClick={() => setSelectedFilterTab("all")}
                        className={`px-4 py-2 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer ${
                          selectedFilterTab === "all"
                            ? "bg-slate-900 text-white shadow-xs scale-102"
                            : "bg-[#FBF9F5] text-slate-600 hover:bg-slate-100 border border-[#EAE5D9]"
                        }`}
                      >
                        All Assets ({totalFiles})
                      </button>

                      {CATEGORIES.map((catKey) => {
                        const count = countByCategory(catKey);
                        const config = CATEGORY_META[catKey];
                        const isActive = selectedFilterTab === catKey;

                        return (
                          <button
                            key={catKey}
                            type="button"
                            onClick={() => setSelectedFilterTab(catKey)}
                            className={`px-3.5 py-2 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                              isActive
                                ? "bg-blue-600 text-white shadow-xs scale-102"
                                : "bg-[#FBF9F5] text-slate-600 hover:bg-slate-100 border border-[#EAE5D9]"
                            }`}
                          >
                            <span>{config.title}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* 3-Column Card Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {filteredStagedList.map((item) => {
                        const fileSizeMB = (item.size / (1024 * 1024)).toFixed(2);
                        const config = CATEGORY_META[item.category];

                        return (
                          <div
                            key={item.key}
                            className="p-4 rounded-md bg-white border border-[#EAE5D9] hover:border-blue-400 hover:shadow-xs transition-all duration-200 group flex flex-col justify-between gap-3 shadow-2xs"
                          >
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <div
                                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 font-bold text-xs ${config.badgeBg} ${config.badgeText} shadow-2xs mt-0.5`}
                                >
                                  PDF
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5
                                    className="font-bold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors"
                                    title={item.name}
                                  >
                                    {item.title}
                                  </h5>
                                  <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                                    {item.name}
                                  </p>
                                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                                    <span className="px-1.5 py-0.2 rounded bg-stone-100 font-bold text-stone-700 text-[10px]">
                                      Grade {item.grade}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-mono text-[10px]">
                                      {item.nomenclatureId}
                                    </span>
                                    <span>•</span>
                                    <span>{fileSizeMB} MB</span>
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => removeFile(item.key)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer shrink-0"
                                title="Remove file"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                              <span className="text-slate-400 font-medium shrink-0">Bucket:</span>
                              <div className="w-36">
                                <SelectDropdown
                                  size="xs"
                                  value={item.category}
                                  onChange={(val) =>
                                    changeCategory(item.key, val as ResourceCategory)
                                  }
                                  options={[
                                    { value: "topic", label: "Topic" },
                                    { value: "activity", label: "Activity" },
                                    { value: "project", label: "Project" },
                                  ]}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Cloud Storage Option */}
                <div className="mt-4 p-3.5 rounded-md bg-stone-50 border border-stone-200 flex items-center justify-between">
                  <span className="font-semibold text-xs text-stone-800 flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-[#B81104]" />
                    <span>Save to Cloud Storage (Cloudinary Permanent Archive)</span>
                  </span>
                  <Checkbox
                    size="sm"
                    checked={saveToCloudinary}
                    onChange={setSaveToCloudinary}
                  />
                </div>
              </div>
            )}

            {/* Upload Progress Indicator */}
            {uploadProgressText && (
              <div className="mb-6 p-4 rounded-md bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-3 shadow-xs animate-in fade-in">
                <Loader2 className="w-5 h-5 text-[#B81104] animate-spin shrink-0" />
                <span>{uploadProgressText}</span>
              </div>
            )}

            {/* Error Banner */}
            {errorMsg && (
              <div className="mb-6 p-4 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-3 shadow-xs">
                <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Sleek SaaS Bottom Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-[#EAE5D9] p-5 sm:p-6 rounded-md shadow-xs transition-all">
              <div className="text-xs sm:text-sm text-slate-500">
                {totalFiles === 0
                  ? "Upload at least 1 curriculum document to proceed."
                  : `${totalFiles} documents staged • ${topicCount} Topics, ${activityCount} Activities, ${projectCount} Projects (${totalSizeMB} MB)`}
              </div>

              <button
                type="button"
                disabled={totalFiles === 0 || isUploading}
                onClick={handleExtractAndProceed}
                className={`inline-flex items-center gap-3 px-8 py-3.5 rounded-md text-sm font-black transition-all duration-200 w-full sm:w-auto justify-center ${
                  totalFiles === 0 || isUploading
                    ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                    : "bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] border border-[#8F0D03] shadow-md shadow-[#B81104]/20 hover:shadow-lg cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                }`}
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#FFFACD] border-t-transparent rounded-full animate-spin" />
                    <span>Extracting PDF Content...</span>
                  </>
                ) : (
                  <>
                    <span>Extract Content &amp; Review Corpus</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </main>

      {/* Cloudinary Curriculum PDF Storage Manager Modal */}
      <CurriculumPdfManager
        isOpen={isPdfStorageOpen}
        onClose={() => setIsPdfStorageOpen(false)}
        initialGrade={selectedGradeMode === "auto" ? 10 : selectedGradeMode}
        onSelectForAssessment={handleSelectAssetForAssessment}
      />
    </div>
  );
}
