"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { CloudinaryAsset, CloudinaryConfigStatus, ResourceMetadata } from "../../../types";
import {
  fetchCloudinaryAssets,
  uploadCloudinaryPdf,
  replaceCloudinaryPdf,
  deleteCloudinaryPdf,
  getCloudinaryConfigStatus,
} from "../../../lib/cloudinary-api";
import {
  CurriculumRecord,
  sortChaptersNumerically,
} from "../../../lib/curriculum-api";
import { useAssessment } from "../../../lib/store";
import { SelectDropdown } from "../../../components/ui";
import { UploadModal } from "../../studio/components/UploadModal";
import { getGrade } from "../../../lib/curriculum-data";
import {
  Cloud,
  FileText,
  Upload,
  RefreshCw,
  Trash2,
  ExternalLink,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  Sparkles,
  Loader2,
  HardDrive,
  Download,
  BookOpen,
  FlaskConical,
  Rocket,
  Layers,
  LayoutGrid,
  List as ListIcon,
  Folder,
  CheckSquare,
  Filter,
  GraduationCap,
  Database,
} from "lucide-react";

export interface CurriculumPdfManagerProps {
  isOpen: boolean;
  onClose: () => void;
  initialGrade?: number;
  availableChapters?: string[];
  records?: CurriculumRecord[];
  onSelectForAssessment?: (asset: CloudinaryAsset | CloudinaryAsset[]) => void;
}

export const CATEGORY_OPTIONS = ["All", "Topic", "Activity", "Project"];

const GRADE_OPTIONS = [
  { value: 0, label: "All Grades" },
  { value: 6, label: "Grade 6" },
  { value: 7, label: "Grade 7" },
  { value: 8, label: "Grade 8" },
  { value: 9, label: "Grade 9" },
  { value: 10, label: "Grade 10" },
  { value: 11, label: "Grade 11" },
  { value: 12, label: "Grade 12" },
];

const CATEGORY_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bg: string;
    border: string;
    dotBg: string;
  }
> = {
  Topic: {
    label: "Topics",
    icon: BookOpen,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    dotBg: "bg-blue-500",
  },
  Activity: {
    label: "Activities",
    icon: FlaskConical,
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    dotBg: "bg-emerald-500",
  },
  Project: {
    label: "Projects",
    icon: Rocket,
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    dotBg: "bg-purple-500",
  },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(isoStr?: string): string {
  if (!isoStr) return "Recently";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Recently";
  }
}

export function CurriculumPdfManager({
  isOpen,
  onClose,
  initialGrade = 10,
  availableChapters = [],
  records = [],
  onSelectForAssessment,
}: CurriculumPdfManagerProps) {
  const { setExtractedData } = useAssessment();

  // Storage & asset states
  const [configStatus, setConfigStatus] = useState<CloudinaryConfigStatus | null>(null);
  const [assets, setAssets] = useState<CloudinaryAsset[]>([]);
  const [totalAssets, setTotalAssets] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters & layout state
  const [selectedGrade, setSelectedGrade] = useState<number>(initialGrade);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedChapter, setSelectedChapter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"newest" | "title" | "grade" | "size">("newest");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Debounce search query by 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Multi-selection state for batch assessment
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // Drag & drop upload state
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Unified Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);

  // Preview Modal State
  const [previewAsset, setPreviewAsset] = useState<CloudinaryAsset | null>(null);

  // Replacement State
  const [replacingAssetId, setReplacingAssetId] = useState<string | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [isReplacing, setIsReplacing] = useState<boolean>(false);

  // Synchronize initial grade when it changes externally
  const [prevInitialGrade, setPrevInitialGrade] = useState(initialGrade);
  if (initialGrade && initialGrade !== prevInitialGrade) {
    setPrevInitialGrade(initialGrade);
    setSelectedGrade(initialGrade);
  }

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Load config status
  useEffect(() => {
    getCloudinaryConfigStatus()
      .then(setConfigStatus)
      .catch((err) => console.warn("Cloudinary status check error:", err));
  }, []);

  // Fetch filtered assets
  const loadAssets = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetchCloudinaryAssets({
        grade: selectedGrade === 0 ? undefined : selectedGrade,
        category: selectedCategory === "All" ? undefined : selectedCategory,
        search: debouncedSearchQuery.trim() || undefined,
        page: 1,
        pageSize: 100,
      });
      setAssets(resp.items);
      setTotalAssets(resp.total);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e.message || "Failed to load curriculum PDF assets.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedGrade, selectedCategory, debouncedSearchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setIsLoading(true);
        setErrorMsg(null);
      }
    });
    fetchCloudinaryAssets({
      grade: selectedGrade === 0 ? undefined : selectedGrade,
      category: selectedCategory === "All" ? undefined : selectedCategory,
      search: debouncedSearchQuery.trim() || undefined,
      page: 1,
      pageSize: 100,
    })
      .then((resp) => {
        if (active) {
          setAssets(resp.items);
          setTotalAssets(resp.total);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const e = err as { message?: string };
          setErrorMsg(e.message || "Failed to load curriculum PDF assets.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedGrade, selectedCategory, debouncedSearchQuery]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewAsset) {
          setPreviewAsset(null);
        } else if (isUploadOpen) {
          setIsUploadOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, previewAsset, isUploadOpen, onClose]);

  // Distinct chapter list from loaded assets + records (filtered by active grade)
  const distinctChapters = useMemo(() => {
    const set = new Set<string>();

    // Add chapters from current assets for the selected grade
    assets.forEach((a) => {
      if (a.chapter && a.chapter.trim()) {
        if (selectedGrade === 0 || a.grade === selectedGrade) {
          set.add(a.chapter.trim());
        }
      }
    });

    // Add chapters from records for the selected grade
    if (records && records.length > 0) {
      records.forEach((r) => {
        if (r.chapter && r.chapter.trim()) {
          if (selectedGrade === 0 || r.grade === selectedGrade) {
            set.add(r.chapter.trim());
          }
        }
      });
    } else {
      availableChapters.forEach((ch) => {
        if (ch && ch.trim()) {
          set.add(ch.trim());
        }
      });
    }

    return Array.from(set).sort(sortChaptersNumerically);
  }, [assets, records, availableChapters, selectedGrade]);

  // Sorted and filtered assets
  const sortedAssets = useMemo(() => {
    let list = [...assets];

    // Filter by Chapter if set
    if (selectedChapter !== "All") {
      list = list.filter((a) => a.chapter === selectedChapter);
    }

    if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } else if (sortBy === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "grade") {
      list.sort((a, b) => a.grade - b.grade);
    } else if (sortBy === "size") {
      list.sort((a, b) => b.file_size_bytes - a.file_size_bytes);
    }
    return list;
  }, [assets, selectedChapter, sortBy]);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: assets.length, Topic: 0, Activity: 0, Project: 0 };
    for (const a of assets) {
      const cat = a.category.charAt(0).toUpperCase() + a.category.slice(1).toLowerCase();
      if (counts[cat] !== undefined) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [assets]);

  // Compute total storage size across loaded assets
  const totalSizeBytes = useMemo(() => {
    return assets.reduce((acc, a) => acc + (a.file_size_bytes || 0), 0);
  }, [assets]);

  // Quick Seed Sample Chapter 7 Module
  const handleSeedSampleModule = async () => {
    setIsSeeding(true);
    setErrorMsg(null);
    try {
      const samplePdfContent =
        "%PDF-1.4\n" +
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n" +
        "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n" +
        "xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\n" +
        "trailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n";

      const sampleBlob = new Blob([samplePdfContent], { type: "application/pdf" });
      const sampleFile = new File([sampleBlob], "Activity_1_Traffic_Light_Controller.pdf", {
        type: "application/pdf",
      });

      await uploadCloudinaryPdf({
        file: sampleFile,
        grade: selectedGrade === 0 ? 10 : selectedGrade,
        chapter: "Chapter 7: Arduino Microcontroller System",
        category: "Activity",
        title: "Traffic Light Controller System (Arduino)",
        overwrite: true,
      });

      showToast("Sample Arduino curriculum module added successfully!");
      await loadAssets();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e.message || "Failed to seed sample module.");
    } finally {
      setIsSeeding(false);
    }
  };

  // Handle Replace
  const handleReplaceSubmit = async (assetId: string) => {
    if (!replacementFile) return;
    setIsReplacing(true);
    setErrorMsg(null);
    try {
      const resp = await replaceCloudinaryPdf(assetId, replacementFile);
      showToast(`Replaced "${resp.asset.title}" with revision v${resp.asset.version}`);
      setReplacingAssetId(null);
      setReplacementFile(null);
      await loadAssets();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e.message || "Replacement failed.");
    } finally {
      setIsReplacing(false);
    }
  };

  // Handle Delete
  const handleDeleteAsset = async (asset: CloudinaryAsset) => {
    if (!window.confirm(`Are you sure you want to delete "${asset.title}" from storage?`)) {
      return;
    }
    try {
      await deleteCloudinaryPdf(asset.id);
      showToast(`Deleted "${asset.title}".`);
      await loadAssets();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e.message || "Failed to delete PDF asset.");
    }
  };

  // Handle Use Multiple or Single Assets in Assessment Studio
  const handleUseAssetsInStudio = (assetsToUse: CloudinaryAsset[]) => {
    if (assetsToUse.length === 0) return;

    const resources: Record<string, string> = {};
    const metadata: Record<string, ResourceMetadata> = {};

    for (const asset of assetsToUse) {
      const key = `${asset.category}-${asset.title}`;
      const previewTxt =
        asset.metadata?.preview_text || `Curriculum Module: ${asset.title}`;
      const specText =
        `=== CLOUDINARY CURRICULUM MODULE: ${asset.title} ===\n` +
        `Grade: Grade ${asset.grade}\n` +
        `Chapter: ${asset.chapter}\n` +
        `Category: ${asset.category}\n` +
        `Cloudinary Delivery URL: ${asset.secure_url}\n\n` +
        `Curriculum Specification & Objectives:\n` +
        `${previewTxt}\n`;

      resources[key] = specText;
      metadata[key] = {
        name: asset.title,
        page_count: asset.metadata?.page_count || 1,
        char_count: specText.length,
        preview: specText.slice(0, 200),
        category: asset.category.toLowerCase(),
        image_count: 0,
      };
    }

    const gNum = assetsToUse[0]?.grade || 6;
    const allSameGrade = assetsToUse.every((a) => a.grade === gNum);
    const chapterLabel =
      assetsToUse.length === 1
        ? assetsToUse[0].chapter || `Grade ${assetsToUse[0].grade} Assessment`
        : allSameGrade
        ? `Grade ${gNum} Curriculum (${assetsToUse.length} Modules)`
        : `Curriculum Assessment (${assetsToUse.length} Modules)`;

    setExtractedData(resources, metadata, chapterLabel);

    showToast(
      `Loaded ${assetsToUse.length} document${
        assetsToUse.length > 1 ? "s" : ""
      } into Assessment Studio!`
    );
    if (onSelectForAssessment) {
      onSelectForAssessment(assetsToUse);
    }
    onClose();
  };

  const handleUseInStudio = (asset: CloudinaryAsset) => {
    handleUseAssetsInStudio([asset]);
  };

  // Toggle selection for batch operations
  const toggleSelectAsset = (id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (selectedAssetIds.size === sortedAssets.length && sortedAssets.length > 0) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(sortedAssets.map((a) => a.id)));
    }
  };

  const handleAddCurrentGradeOrAllToStudio = () => {
    const targetAssets =
      selectedGrade === 0
        ? sortedAssets
        : assets.filter((a) => a.grade === selectedGrade);

    if (targetAssets.length === 0) {
      showToast("No curriculum files found to add.");
      return;
    }
    handleUseAssetsInStudio(targetAssets);
  };

  // Drag & drop on window
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const pdfFiles = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );

      if (pdfFiles.length > 0) {
        setIsUploadOpen(true);
      } else {
        setErrorMsg("Please drop authentic PDF documents (.pdf) only.");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Curriculum PDF Storage"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-stone-950/80 backdrop-blur-xs animate-in fade-in duration-200"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Master Modal Shell (Spacious, Balanced & Modern Layout) */}
      <div className="relative w-full max-w-[1140px] h-[88vh] max-h-[880px] min-h-[580px] flex flex-col rounded-xl bg-white border border-stone-200/90 shadow-2xl overflow-hidden">
        {/* =========================================================
            1. TOP COMMAND HEADER (Spacious & Refined)
            ========================================================= */}
        <header className="px-5 py-3 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#B81104] text-[#FFFACD] flex items-center justify-center shadow-xs shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-stone-900 tracking-tight">
                  Curriculum PDF Storage
                </h2>

                {configStatus?.configured ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Active ({configStatus.cloud_name})</span>
                  </span>
                ) : configStatus === null ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-500 border border-stone-200">
                    <Loader2 className="w-3 h-3 animate-spin text-stone-400" />
                    <span>Connecting...</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <HardDrive className="w-3 h-3" />
                    <span>Local Staging</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 font-medium hidden sm:block">
                Permanent document cloud repository &amp; AI extraction corpus for Grades 6–12
              </p>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="hidden lg:flex items-center gap-2 text-xs font-semibold">
            <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 border border-stone-200">
              📊 {totalAssets} Docs
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
              📘 {categoryCounts.Topic || 0} Topics
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              🔬 {categoryCounts.Activity || 0} Activities
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
              🚀 {categoryCounts.Project || 0} Projects
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-stone-50 text-stone-500 border border-stone-200 font-mono text-[11px]">
              💾 {formatBytes(totalSizeBytes)}
            </span>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-2">
            {/* Mobile Sidebar Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
              className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-stone-700 text-xs font-bold"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
            </button>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-stone-600">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                title="Grid View"
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-white text-stone-900 shadow-2xs font-bold"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                title="Table View"
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === "list"
                    ? "bg-white text-stone-900 shadow-2xs font-bold"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                <ListIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Add All for Current Grade */}
            <button
              type="button"
              onClick={handleAddCurrentGradeOrAllToStudio}
              disabled={assets.length === 0}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-[#FFFACD] text-xs font-bold border border-stone-800 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>
                {selectedGrade === 0
                  ? `Add All (${assets.length})`
                  : `Add All Grade ${selectedGrade} (${assets.filter((a) => a.grade === selectedGrade).length})`}
              </span>
            </button>

            {/* Primary Upload PDF(s) */}
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-bold border border-[#8F0D03] shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload PDF(s)</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 flex items-center justify-center cursor-pointer transition-colors"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Notifications & Error Toast */}
        {successToast && (
          <div className="mx-5 mt-3 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 shadow-2xs animate-in slide-in-from-top-1 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center justify-between shadow-2xs shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* =========================================================
            2. TWO-PANE WORKSPACE (Sidebar + Content Canvas)
            ========================================================= */}
        <div className="flex-1 flex min-h-0 relative overflow-hidden bg-stone-50/50">
          {/* -------------------------------------------------------
              LEFT SIDEBAR: Grade, Category, Chapter & Cloud Health (Spacious & Refined)
              ------------------------------------------------------- */}
          <aside
            className={`w-56 sm:w-60 border-r border-stone-200 bg-white flex flex-col justify-between shrink-0 transition-all z-20 min-h-0 ${
              isMobileSidebarOpen
                ? "absolute inset-y-0 left-0 shadow-2xl flex"
                : "hidden lg:flex"
            }`}
          >
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-3.5 space-y-4 scrollbar-thin scrollbar-thumb-stone-200 hover:scrollbar-thumb-stone-300">
              {/* Section 1: Grade Hierarchy */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-[#B81104]" />
                    <span>Grade Level</span>
                  </span>
                  <button
                    type="button"
                    onClick={loadAssets}
                    disabled={isLoading}
                    title="Refresh Asset Catalog"
                    className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 cursor-pointer transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin text-[#B81104]" : ""}`} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {GRADE_OPTIONS.map((g) => {
                    const isActive = selectedGrade === g.value;
                    const countForGrade =
                      g.value === 0
                        ? totalAssets
                        : assets.filter((a) => a.grade === g.value).length;

                    return (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => {
                          setSelectedGrade(g.value);
                          setSelectedChapter("All");
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? "bg-[#B81104] text-[#FFFACD] shadow-xs ring-1 ring-[#8F0D03]"
                            : "bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200/80"
                        }`}
                      >
                        <span className="truncate">{g.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ml-1 ${
                            isActive
                              ? "bg-white/20 text-[#FFFACD]"
                              : "bg-stone-200/80 text-stone-600"
                          }`}
                        >
                          {countForGrade}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: 3 Curriculum Categories */}
              <div className="space-y-1.5 pt-3 border-t border-stone-100">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">
                    Curriculum Bucket
                  </span>
                  {selectedCategory !== "All" && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory("All")}
                      className="text-[10px] text-[#B81104] font-bold hover:underline cursor-pointer"
                    >
                      Show All
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {CATEGORY_OPTIONS.map((cat) => {
                    const isActive = selectedCategory === cat;
                    const count = categoryCounts[cat] ?? 0;
                    const IconComponent =
                      cat === "All"
                        ? Layers
                        : cat === "Topic"
                        ? BookOpen
                        : cat === "Activity"
                        ? FlaskConical
                        : Rocket;

                    const catMeta = CATEGORY_META[cat];

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat);
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? "bg-stone-900 text-white shadow-xs"
                            : "text-stone-700 hover:text-stone-900 hover:bg-stone-100 border border-transparent hover:border-stone-200"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <IconComponent
                            className={`w-4 h-4 ${
                              isActive
                                ? "text-white"
                                : catMeta
                                ? catMeta.color
                                : "text-stone-500"
                            }`}
                          />
                          <span>{cat === "All" ? "All Categories" : catMeta?.label || cat}</span>
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            isActive ? "bg-stone-700 text-stone-200" : "bg-stone-100 text-stone-500"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: Chapters & Units Navigator (Single unified scroll, no inner trap) */}
              {distinctChapters.length > 0 && (
                <div className="space-y-1.5 pt-3 border-t border-stone-100">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-amber-600" />
                      <span>Chapters ({distinctChapters.length})</span>
                    </span>
                    {selectedChapter !== "All" && (
                      <button
                        type="button"
                        onClick={() => setSelectedChapter("All")}
                        className="text-[10px] text-[#B81104] font-bold hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setSelectedChapter("All")}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold truncate transition-colors cursor-pointer ${
                        selectedChapter === "All"
                          ? "bg-amber-100/70 text-amber-950 font-bold border border-amber-300"
                          : "text-stone-600 hover:bg-stone-100"
                      }`}
                    >
                      <span>All Chapters</span>
                      <span className="text-[10px] text-stone-400 font-mono">
                        {assets.length}
                      </span>
                    </button>
                    {distinctChapters.map((ch) => {
                      const isActive = selectedChapter === ch;
                      const countInChapter = assets.filter((a) => a.chapter === ch).length;

                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => {
                            setSelectedChapter(ch);
                            setIsMobileSidebarOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium truncate transition-colors cursor-pointer ${
                            isActive
                              ? "bg-amber-100/70 text-amber-950 font-bold border border-amber-300"
                              : "text-stone-600 hover:bg-stone-100"
                          }`}
                          title={ch}
                        >
                          <span className="truncate">{ch}</span>
                          <span className="text-[10px] text-stone-400 font-mono ml-1 shrink-0">
                            {countInChapter}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Bottom Storage Health Card */}
            <div className="p-3 border-t border-stone-200 bg-stone-50/70">
              <div className="p-3 rounded-lg bg-white border border-stone-200 shadow-2xs space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[11px] font-bold text-stone-700">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-[#B81104]" />
                    <span>Cloud Storage</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Ready</span>
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 leading-snug">
                  PyMuPDF compression active. Stored PDFs stay under 10MB threshold.
                </p>
              </div>
            </div>
          </aside>

          {/* -------------------------------------------------------
              RIGHT MAIN CANVAS: Search Toolbar + Asset Cards / Table
              ------------------------------------------------------- */}
          <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#FDFBF7]">
            {/* Top Toolbar: Search + Active Filter Pills + Sort + Bulk Select (Spacious & Refined) */}
            <div className="px-5 py-2.5 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0 sticky top-0 z-10 shadow-2xs">
              {/* Search Bar & Active Filters */}
              <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-xl">
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search PDFs by title, chapter, tag..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-stone-200 text-xs text-stone-900 placeholder-stone-400 focus:outline-hidden focus:border-[#B81104] bg-stone-50 focus:bg-white shadow-2xs transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Active Grade Filter Tag */}
                {selectedGrade !== 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold shrink-0">
                    <span>Grade {selectedGrade}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedGrade(0)}
                      className="text-blue-500 hover:text-blue-800 cursor-pointer"
                      title="Clear grade filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {/* Active Category Filter Tag */}
                {selectedCategory !== "All" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100 text-stone-800 border border-stone-200 text-xs font-bold shrink-0">
                    <span>{selectedCategory}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory("All")}
                      className="text-stone-500 hover:text-stone-800 cursor-pointer"
                      title="Clear category filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {/* Active Chapter Filter Tag */}
                {selectedChapter !== "All" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold shrink-0">
                    <Folder className="w-3.5 h-3.5 text-amber-600" />
                    <span className="max-w-[130px] truncate">{selectedChapter}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedChapter("All")}
                      className="text-amber-500 hover:text-amber-800 cursor-pointer"
                      title="Clear chapter filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>

              {/* Multi-Select & Sort Dropdown */}
              <div className="flex items-center gap-2">
                {sortedAssets.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors bg-white hover:bg-stone-50 text-stone-700 border-stone-300 shadow-2xs"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-[#B81104]" />
                    <span>
                      {selectedAssetIds.size === sortedAssets.length
                        ? "Deselect All"
                        : `Select All (${sortedAssets.length})`}
                    </span>
                  </button>
                )}

                <div className="w-40 shrink-0">
                  <SelectDropdown
                    size="xs"
                    value={sortBy}
                    onChange={(val) => setSortBy(val as "newest" | "title" | "grade" | "size")}
                    options={[
                      { value: "newest", label: "Recently Updated" },
                      { value: "title", label: "Title (A-Z)" },
                      { value: "grade", label: "Grade (Ascending)" },
                      { value: "size", label: "Size (Largest)" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Scrollable Document Catalog Canvas (Spacious & Smooth) */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 scrollbar-thin scrollbar-thumb-stone-300 hover:scrollbar-thumb-stone-400 pb-20">
              {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-stone-400">
                  <Loader2 className="w-8 h-8 animate-spin text-[#B81104]" />
                  <p className="text-xs font-bold text-stone-700">Querying Curriculum PDF Storage...</p>
                  <p className="text-[11px] text-stone-400">
                    Filtering Grade {selectedGrade === 0 ? "All" : selectedGrade} &bull; {selectedCategory}
                  </p>
                </div>
              ) : sortedAssets.length === 0 ? (
                /* Empty State with Drag-and-Drop Dropzone */
                <div
                  className={`rounded-xl border-2 border-dashed p-8 sm:p-10 text-center transition-all bg-white shadow-xs ${
                    isDragOver
                      ? "border-[#B81104] bg-red-50/30 scale-[0.99] ring-4 ring-red-100"
                      : "border-stone-300 hover:border-[#B81104]"
                  }`}
                >
                  <div className="max-w-md mx-auto space-y-3.5">
                    <div className="w-12 h-12 rounded-xl bg-red-50 text-[#B81104] flex items-center justify-center mx-auto shadow-2xs">
                      <FileText className="w-6 h-6" />
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base font-extrabold text-stone-900">
                        {searchQuery
                          ? `No documents matching "${searchQuery}"`
                          : `No Curriculum PDFs for Grade ${selectedGrade === 0 ? "All" : selectedGrade}`}
                      </h3>
                      <p className="text-xs text-stone-500 leading-relaxed font-medium">
                        Drag and drop curriculum PDF worksheets or modules here to auto-catalog and extract specifications.
                      </p>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsUploadOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-bold border border-[#8F0D03] shadow-xs transition-colors cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload PDF(s)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSeedSampleModule}
                        disabled={isSeeding}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold border border-stone-200 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSeeding ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        <span>Add Sample Module</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : viewMode === "grid" ? (
                /* Modern Card Grid View (Balanced 2-Column Grid with Rich Cards) */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {sortedAssets.map((asset) => {
                    const catMeta = CATEGORY_META[asset.category] || {
                      label: asset.category,
                      icon: FileText,
                      color: "text-stone-700",
                      bg: "bg-stone-50",
                      border: "border-stone-200",
                      dotBg: "bg-stone-400",
                    };
                    const CatIcon = catMeta.icon;
                    const isSelected = selectedAssetIds.has(asset.id);

                    return (
                      <div
                        key={asset.id}
                        className={`flex flex-col justify-between rounded-xl border bg-white shadow-xs hover:shadow-md transition-all overflow-hidden group ${
                          isSelected
                            ? "border-[#B81104] ring-2 ring-[#B81104]/25 bg-red-50/10"
                            : "border-stone-200 hover:border-[#B81104]/40"
                        }`}
                      >
                        {/* Card Header & Badges */}
                        <div className="p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectAsset(asset.id)}
                                className="w-4 h-4 rounded border-stone-300 text-[#B81104] focus:ring-[#B81104] cursor-pointer"
                                title="Select for assessment"
                              />
                              <span
                                className={`inline-flex items-center gap-1.5 text-[10px] uppercase font-black px-2 py-0.5 rounded-md border ${catMeta.bg} ${catMeta.color} ${catMeta.border}`}
                              >
                                <CatIcon className="w-3 h-3" />
                                <span>{asset.category}</span>
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                                Grade {asset.grade}
                              </span>
                            </div>
                            <span className="text-[10px] text-stone-400 font-mono shrink-0">
                              v{asset.version} • {formatBytes(asset.file_size_bytes)}
                            </span>
                          </div>

                          {/* Title & Chapter Folder with Complete Data */}
                          <div className="space-y-1">
                            <h4
                              className="text-sm font-bold text-stone-900 group-hover:text-[#B81104] transition-colors line-clamp-2 cursor-pointer leading-snug break-words"
                              title={asset.title}
                              onClick={() => setPreviewAsset(asset)}
                            >
                              {asset.title}
                            </h4>
                            <div className="flex items-center gap-1.5 text-xs text-stone-600 font-medium pt-0.5">
                              <Folder className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="line-clamp-2 leading-snug break-words" title={asset.chapter}>
                                {asset.chapter}
                              </span>
                            </div>
                          </div>

                          {/* Educational Content Preview Snippet */}
                          {asset.metadata?.preview_text && (
                            <div className="p-2.5 rounded-lg bg-stone-50/90 border border-stone-100 text-xs text-stone-600 leading-relaxed line-clamp-2 italic">
                              &ldquo;{asset.metadata.preview_text}&rdquo;
                            </div>
                          )}

                          {/* Document Metadata Specs Bar */}
                          <div className="flex items-center justify-between text-xs text-stone-400 pt-0.5">
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              <span>
                                {asset.metadata?.page_count
                                  ? `${asset.metadata.page_count} pages`
                                  : "Single page"}
                              </span>
                            </span>
                            <span>{formatDate(asset.updated_at)}</span>
                          </div>
                        </div>

                        {/* Card Action Footer */}
                        <div className="px-3.5 py-2 bg-stone-50/90 border-t border-stone-100 flex items-center justify-between gap-2">
                          {/* Secondary Utility Tools */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPreviewAsset(asset)}
                              title="Preview PDF Document"
                              className="p-1.5 rounded-md hover:bg-stone-200 text-stone-600 hover:text-stone-900 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReplacingAssetId(asset.id);
                                setReplacementFile(null);
                              }}
                              title="Upload Newer Revision"
                              className="p-1.5 rounded-md hover:bg-stone-200 text-stone-600 hover:text-stone-900 cursor-pointer transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={asset.secure_url}
                              target="_blank"
                              rel="noreferrer"
                              title="Open Delivery URL"
                              className="p-1.5 rounded-md hover:bg-stone-200 text-stone-600 hover:text-stone-900 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDeleteAsset(asset)}
                              title="Delete Asset from Storage"
                              className="p-1.5 rounded-md hover:bg-red-50 text-stone-400 hover:text-red-700 cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Primary CTA: Direct Use in Assessment Studio */}
                          <button
                            type="button"
                            onClick={() => handleUseInStudio(asset)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B81104] hover:bg-[#9E0E03] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                            <span>Assess</span>
                          </button>
                        </div>

                        {/* Inline Replacement Tray */}
                        {replacingAssetId === asset.id && (
                          <div className="p-3 bg-amber-50 border-t border-amber-200 space-y-2 animate-in fade-in">
                            <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                              <span>Upload Revision (v{asset.version + 1}):</span>
                              <button
                                type="button"
                                onClick={() => setReplacingAssetId(null)}
                                className="text-stone-400 hover:text-stone-700"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <input
                              type="file"
                              accept=".pdf"
                              title=""
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  setReplacementFile(e.target.files[0]);
                                }
                              }}
                              className="text-xs text-stone-700 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-stone-800 file:text-white cursor-pointer"
                            />
                            {replacementFile && (
                              <button
                                type="button"
                                onClick={() => handleReplaceSubmit(asset.id)}
                                disabled={isReplacing}
                                className="w-full py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                {isReplacing ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3.5 h-3.5" />
                                )}
                                <span>Confirm Revision</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Structured Table List View (Refined) */
                <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-stone-100/80 border-b border-stone-200 text-stone-600 font-extrabold uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-3 w-8 text-center">
                          <input
                            type="checkbox"
                            checked={
                              sortedAssets.length > 0 &&
                              selectedAssetIds.size === sortedAssets.length
                            }
                            onChange={handleSelectAllVisible}
                            className="w-4 h-4 rounded border-stone-300 text-[#B81104] focus:ring-[#B81104] cursor-pointer"
                            title="Select or deselect all"
                          />
                        </th>
                        <th className="py-2.5 px-3.5">Document Title</th>
                        <th className="py-2.5 px-3">Chapter</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Grade</th>
                        <th className="py-2.5 px-3">Size / Pages</th>
                        <th className="py-2.5 px-3">Updated</th>
                        <th className="py-2.5 px-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {sortedAssets.map((asset) => {
                        const isSelected = selectedAssetIds.has(asset.id);
                        const catMeta = CATEGORY_META[asset.category] || {
                          label: asset.category,
                          color: "text-stone-700",
                          bg: "bg-stone-50",
                          border: "border-stone-200",
                        };

                        return (
                          <tr
                            key={asset.id}
                            className={`transition-colors ${
                              isSelected ? "bg-red-50/40" : "hover:bg-stone-50/80"
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectAsset(asset.id)}
                                className="w-4 h-4 rounded border-stone-300 text-[#B81104] focus:ring-[#B81104] cursor-pointer"
                                title="Select for assessment"
                              />
                            </td>
                            <td className="py-2.5 px-3.5">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                                <div>
                                  <div
                                    className="font-bold text-stone-900 hover:text-[#B81104] cursor-pointer text-xs leading-snug"
                                    onClick={() => setPreviewAsset(asset)}
                                  >
                                    {asset.title}
                                  </div>
                                  <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                                    {asset.original_filename}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-stone-600 font-medium max-w-[160px] truncate" title={asset.chapter}>
                              {asset.chapter}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${catMeta.bg} ${catMeta.color} ${catMeta.border}`}
                              >
                                {asset.category}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-stone-700">
                              Grade {asset.grade}
                            </td>
                            <td className="py-2.5 px-3 text-stone-500 font-medium text-xs">
                              {formatBytes(asset.file_size_bytes)} &bull; {asset.metadata?.page_count || 1}p
                            </td>
                            <td className="py-2.5 px-3 text-stone-400 text-xs">
                              {formatDate(asset.updated_at)}
                            </td>
                            <td className="py-2.5 px-3.5 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPreviewAsset(asset)}
                                  title="Preview Document"
                                  className="p-1.5 rounded hover:bg-stone-200 text-stone-600 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <a
                                  href={asset.secure_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Cloudinary Delivery"
                                  className="p-1.5 rounded hover:bg-stone-200 text-stone-600"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAsset(asset)}
                                  title="Delete Document"
                                  className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-700 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUseInStudio(asset)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#B81104] hover:bg-[#9E0E03] text-white text-xs font-bold cursor-pointer shadow-2xs"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  <span>Assess</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Floating Batch Selection Dock (Spacious & Refined) */}
              {selectedAssetIds.size > 0 && (
                <div className="sticky bottom-3 left-0 right-0 mx-auto max-w-lg z-30 bg-stone-900 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-stone-700 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                    <span className="text-xs font-bold font-mono truncate">
                      {selectedAssetIds.size} document{selectedAssetIds.size > 1 ? "s" : ""} selected
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const selectedList = assets.filter((a) => selectedAssetIds.has(a.id));
                        handleUseAssetsInStudio(selectedList);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#B81104] hover:bg-[#A00F03] text-[#FFFACD] text-xs font-black shadow-xs transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                      <span>Assess in Studio</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedAssetIds(new Set())}
                      className="text-xs text-stone-400 hover:text-white px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Status Footer (Spacious & Refined) */}
            <footer className="px-5 py-2.5 bg-white border-t border-stone-200 flex flex-wrap items-center justify-between text-xs text-stone-500 shrink-0">
              <div className="flex items-center gap-2">
                <span>
                  Showing <strong className="text-stone-900">{sortedAssets.length}</strong> of{" "}
                  <strong className="text-stone-900">{totalAssets}</strong> stored PDFs in{" "}
                  {selectedGrade === 0 ? "All Grades" : `Grade ${selectedGrade}`}
                </span>
                <span>•</span>
                <span>Storage: {formatBytes(totalSizeBytes)}</span>
                <span>•</span>
                <span className="text-emerald-700 font-medium">Cloud CDN Active</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 text-stone-700 text-xs font-bold cursor-pointer transition-colors"
              >
                Close
              </button>
            </footer>
          </main>
        </div>
      </div>

      {/* Unified Bulk Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        activeGrade={getGrade(selectedGrade === 0 ? initialGrade || 10 : selectedGrade)}
        initialGradeId={selectedGrade === 0 ? initialGrade || 10 : selectedGrade}
        availableChapters={distinctChapters}
        records={records}
        onUploadSuccess={() => {
          loadAssets();
          showToast("Curriculum documents uploaded and cataloged successfully!");
        }}
      />

      {/* PDF Embedded Preview Modal (Compact) */}
      {previewAsset && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${previewAsset.title}`}
          className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-5 bg-stone-950/85 backdrop-blur-xs animate-in fade-in"
        >
          <div className="relative w-full max-w-3xl h-[80vh] flex flex-col rounded-lg bg-white border border-stone-200 shadow-2xl overflow-hidden">
            {/* Viewer Header */}
            <div className="px-4 py-2.5 bg-stone-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="font-semibold text-xs sm:text-sm truncate">{previewAsset.title}</span>
                <span className="text-[10px] text-stone-400 font-mono">
                  (Grade {previewAsset.grade} &bull; {previewAsset.category})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleUseInStudio(previewAsset)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-semibold border border-[#8F0D03] cursor-pointer shadow-xs transition-colors"
                >
                  <Sparkles className="w-3 h-3 text-amber-200" />
                  <span>Assess in Studio</span>
                </button>
                <a
                  href={previewAsset.secure_url}
                  download={previewAsset.original_filename}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-800 hover:bg-stone-700 text-xs text-stone-200 font-semibold border border-stone-700 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className="w-7 h-7 rounded-md hover:bg-stone-800 text-stone-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Embedded Iframe Reader */}
            <div className="flex-1 bg-stone-100 w-full h-full relative">
              <iframe
                src={`${previewAsset.secure_url}#toolbar=1`}
                title={previewAsset.title}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
