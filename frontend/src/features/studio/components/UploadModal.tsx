"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GradeDefinition } from "../types";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Cloud,
  Sparkles,
  BookOpen,
  FlaskConical,
  Rocket,
  FileText,
  FolderOpen,
} from "lucide-react";
import { uploadCurriculumPdfs, extractErrorMessage } from "../../../lib/api";
import { uploadCloudinaryPdf } from "../../../lib/cloudinary-api";
import {
  parseCurriculumFilename,
  extractChapterNumber,
  sortChaptersNumerically,
  CurriculumRecord,
  fetchCurriculumRecords,
} from "../../../lib/curriculum-api";
import { useAssessment } from "../../../lib/store";
import { getGrade } from "../../../lib/curriculum-data";
import { Checkbox, SelectDropdown, SelectOption } from "../../../components/ui";

export interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeGrade?: GradeDefinition;
  initialGradeId?: number;
  availableChapters?: string[];
  initialChapter?: string;
  records?: CurriculumRecord[];
  onUploadSuccess?: () => void;
  onOpenPdfStorage?: () => void;
}

interface StagedFileRecord {
  file: File;
  name: string;
  size: number;
  title: string;
  category: "Topic" | "Activity" | "Project";
  chapter: string;
  grade: number;
  sequence: number;
  nomenclatureId: string;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function UploadModal({
  isOpen,
  onClose,
  activeGrade,
  initialGradeId,
  availableChapters = [],
  initialChapter,
  records = [],
  onUploadSuccess,
  onOpenPdfStorage,
}: UploadModalProps) {
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [saveToCloudinary, setSaveToCloudinary] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Grade selector mode: 'auto' | 6..12
  const [selectedGradeMode, setSelectedGradeMode] = useState<"auto" | number>(() => {
    return initialGradeId || activeGrade?.id || 10;
  });

  // Chapter selector state: 'auto' | existing chapter string | 'custom'
  const [selectedChapterMode, setSelectedChapterMode] = useState<string>(() => {
    return initialChapter || (availableChapters.length > 0 ? availableChapters[0] : "auto");
  });
  const [customChapterName, setCustomChapterName] = useState<string>("");

  // Category sorting mode: 'auto' (smart AI detection) | 'Topic' | 'Activity' | 'Project'
  const [categoryMode, setCategoryMode] = useState<"auto" | "Topic" | "Activity" | "Project">("auto");

  // Per-file manual overrides if user adjusts a specific item
  const [fileCategoryOverrides, setFileCategoryOverrides] = useState<
    Record<string, "Topic" | "Activity" | "Project">
  >({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setExtractedData } = useAssessment();

  // Records cache populated from prop or fetched on mount
  const [cachedRecords, setCachedRecords] = useState<CurriculumRecord[]>(records);

  useEffect(() => {
    if (records && records.length > 0) {
      setCachedRecords(records);
    } else if (isOpen) {
      fetchCurriculumRecords()
        .then((res) => {
          if (res.records && res.records.length > 0) {
            setCachedRecords(res.records);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, records]);

  // Synchronize initial grade & chapter when modal opens without cascading renders
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      if (initialGradeId) {
        setSelectedGradeMode(initialGradeId);
      } else if (activeGrade?.id) {
        setSelectedGradeMode(activeGrade.id);
      }
      if (initialChapter) {
        setSelectedChapterMode(initialChapter);
      } else if (availableChapters.length > 0 && selectedChapterMode === "auto") {
        setSelectedChapterMode(availableChapters[0]);
      }
    }
  }

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isUploading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isUploading]);

  // Distinct chapters filtered by currently targeted grade mode
  const chaptersForGrade = useMemo(() => {
    const activeRecords = records && records.length > 0 ? records : cachedRecords;
    const targetGrade =
      selectedGradeMode === "auto"
        ? (activeGrade?.id || initialGradeId || 10)
        : selectedGradeMode;

    const set = new Set<string>();

    if (activeRecords.length > 0) {
      activeRecords
        .filter((r) => r.grade === targetGrade)
        .forEach((r) => {
          if (r.chapter && r.chapter.trim()) set.add(r.chapter.trim());
        });
    }

    // Fallback to availableChapters only if no records match
    if (set.size === 0 && availableChapters && availableChapters.length > 0) {
      availableChapters.forEach((ch) => {
        if (ch && ch.trim()) set.add(ch.trim());
      });
    }

    // Fallback standard chapters if still completely empty
    if (set.size === 0) {
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((n) => {
        set.add(`Chapter ${n}`);
      });
    }

    return Array.from(set).sort(sortChaptersNumerically);
  }, [records, cachedRecords, selectedGradeMode, activeGrade?.id, initialGradeId, availableChapters]);

  // Grade switch handler: auto-syncs chapter options to target grade
  const handleGradeChange = useCallback(
    (val: string) => {
      const nextGrade = val === "auto" ? "auto" : parseInt(val, 10);
      setSelectedGradeMode(nextGrade);

      if (selectedChapterMode !== "auto" && selectedChapterMode !== "custom") {
        const activeRecords = records && records.length > 0 ? records : cachedRecords;
        const targetG = nextGrade === "auto" ? (activeGrade?.id || initialGradeId || 10) : nextGrade;
        const nextGradeChapters = activeRecords
          .filter((r) => r.grade === targetG)
          .map((r) => r.chapter.trim());

        if (nextGradeChapters.length > 0 && !nextGradeChapters.includes(selectedChapterMode)) {
          const sorted = [...new Set(nextGradeChapters)].sort(sortChaptersNumerically);
          setSelectedChapterMode(sorted[0]);
        }
      }
    },
    [selectedChapterMode, records, cachedRecords, activeGrade?.id, initialGradeId]
  );

  // Grade dropdown options
  const gradeOptions: SelectOption[] = useMemo(() => {
    return [
      {
        value: "auto",
        label: "⚡ Auto-detect Grade per file (Smart)",
        badge: { text: "Smart AI", variant: "emerald" },
      },
      ...[6, 7, 8, 9, 10, 11, 12].map((g) => ({
        value: String(g),
        label: `Grade ${g}`,
      })),
    ];
  }, []);

  // Chapter dropdown options with complete titles and numeric chapter order
  const chapterOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [
      {
        value: "auto",
        label: "⚡ Auto-detect Chapter from files (Smart AI)",
        sublabel: "Auto-extracts chapter title & number from file names",
        badge: { text: "Smart AI", variant: "emerald" },
      },
    ];

    chaptersForGrade.forEach((ch) => {
      const chNum = extractChapterNumber(ch);
      const gradeText =
        selectedGradeMode === "auto"
          ? `Grade ${activeGrade?.id || initialGradeId || 10}`
          : `Grade ${selectedGradeMode}`;
      opts.push({
        value: ch,
        label: ch,
        sublabel: `${gradeText} Curriculum Chapter`,
        badge: { text: chNum < 999 ? `Ch ${chNum}` : "Existing", variant: "blue" },
      });
    });

    opts.push({
      value: "custom",
      label: "✏️ Create New Chapter...",
      sublabel: "Type a custom curriculum chapter or unit name",
      badge: { text: "Custom", variant: "slate" },
    });

    return opts;
  }, [chaptersForGrade, selectedGradeMode, activeGrade?.id, initialGradeId]);

  // Handle file additions
  const handleAddFiles = useCallback((newFiles: FileList | File[]) => {
    const pdfs = Array.from(newFiles).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) return;

    setUploadFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const filtered = pdfs.filter((f) => !existingNames.has(f.name));
      return [...prev, ...filtered];
    });
  }, []);

  // Compute parsed records for each staged file
  const stagedRecords: StagedFileRecord[] = useMemo(() => {
    const effectiveGradeNum =
      selectedGradeMode === "auto" ? activeGrade?.id || 10 : selectedGradeMode;

    return uploadFiles.map((file) => {
      const parsed = parseCurriculumFilename(file.name, {
        currentGrade: selectedGradeMode === "auto" ? undefined : selectedGradeMode,
        availableChapters: chaptersForGrade,
        currentChapter:
          selectedChapterMode !== "auto" && selectedChapterMode !== "custom"
            ? selectedChapterMode
            : selectedChapterMode === "custom" && customChapterName.trim()
            ? customChapterName.trim()
            : undefined,
      });

      // Grade logic
      const resolvedGrade =
        selectedGradeMode === "auto" ? parsed.grade || effectiveGradeNum : selectedGradeMode;

      // Category logic: manual override -> categoryMode force -> auto-parsed
      let resolvedCategory: "Topic" | "Activity" | "Project" = "Topic";
      if (fileCategoryOverrides[file.name]) {
        resolvedCategory = fileCategoryOverrides[file.name];
      } else if (categoryMode !== "auto") {
        resolvedCategory = categoryMode;
      } else {
        resolvedCategory = parsed.category || "Topic";
      }

      // Chapter logic
      let resolvedChapter = `Grade ${resolvedGrade} Curriculum`;
      if (selectedChapterMode === "custom" && customChapterName.trim()) {
        resolvedChapter = customChapterName.trim();
      } else if (selectedChapterMode !== "auto" && selectedChapterMode !== "custom") {
        resolvedChapter = selectedChapterMode;
      } else if (parsed.chapter && !parsed.chapter.includes("Curriculum Chapter")) {
        resolvedChapter = parsed.chapter;
      } else if (availableChapters.length > 0) {
        resolvedChapter = availableChapters[0];
      }

      return {
        file,
        name: file.name,
        size: file.size,
        title: parsed.documentTitle || file.name.replace(/\.pdf$/i, ""),
        category: resolvedCategory,
        chapter: resolvedChapter,
        grade: resolvedGrade,
        sequence: parsed.sequence,
        nomenclatureId: parsed.nomenclatureId,
      };
    });
  }, [
    uploadFiles,
    activeGrade,
    availableChapters,
    selectedGradeMode,
    selectedChapterMode,
    customChapterName,
    categoryMode,
    fileCategoryOverrides,
  ]);

  // Breakdown counts by category
  const categoryCounts = useMemo(() => {
    const counts = { Topic: 0, Activity: 0, Project: 0 };
    stagedRecords.forEach((r) => {
      if (r.category in counts) {
        counts[r.category]++;
      }
    });
    return counts;
  }, [stagedRecords]);

  // Toggle single file category override
  const handleSetFileCategory = (
    fileName: string,
    cat: "Topic" | "Activity" | "Project"
  ) => {
    setFileCategoryOverrides((prev) => ({
      ...prev,
      [fileName]: cat,
    }));
  };

  // Remove single file
  const handleRemoveFile = (fileName: string) => {
    setUploadFiles((prev) => prev.filter((f) => f.name !== fileName));
    setFileCategoryOverrides((prev) => {
      const copy = { ...prev };
      delete copy[fileName];
      return copy;
    });
  };

  // Active grade label for display
  const activeGradeName = useMemo(() => {
    if (selectedGradeMode === "auto") {
      return activeGrade?.name || "Auto-detect";
    }
    return getGrade(selectedGradeMode).name;
  }, [selectedGradeMode, activeGrade]);

  // Upload handler
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stagedRecords.length === 0 || isUploading) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadProgressText("Analyzing documents & extracting OCR text...");

    try {
      // 1. Build category map for backend upload-pdfs
      const categoryMap: Record<string, string> = {};
      stagedRecords.forEach((r) => {
        categoryMap[r.name] = r.category;
      });

      // 2. Ingest PDFs through OCR backend
      const filesToUpload = stagedRecords.map((r) => r.file);
      const resp = await uploadCurriculumPdfs(filesToUpload, categoryMap);

      const resolvedChapterLabel =
        selectedChapterMode === "custom" && customChapterName.trim()
          ? customChapterName.trim()
          : selectedChapterMode !== "auto" && selectedChapterMode !== "custom"
          ? selectedChapterMode
          : resp.suggested_chapter_title || `${activeGradeName} Curriculum`;

      setExtractedData(resp.resources, resp.metadata, resolvedChapterLabel);

      // 3. Upload to Cloudinary Cloud Storage if requested
      if (saveToCloudinary) {
        for (let i = 0; i < stagedRecords.length; i++) {
          const rec = stagedRecords[i];
          setUploadProgressText(
            `Uploading to Cloud Storage (${i + 1}/${stagedRecords.length}): ${rec.title}...`
          );

          try {
            await uploadCloudinaryPdf({
              file: rec.file,
              grade: rec.grade,
              chapter: rec.chapter,
              category: rec.category,
              title: rec.title,
            });
          } catch (cloudErr) {
            console.warn("Cloudinary upload failed for:", rec.name, cloudErr);
          }
        }
      }

      setUploadProgressText(null);
      setUploadSuccessMsg(
        `Successfully uploaded and auto-sorted ${stagedRecords.length} files (${categoryCounts.Topic} Topics, ${categoryCounts.Activity} Activities, ${categoryCounts.Project} Projects) into ${resolvedChapterLabel}.`
      );

      if (onUploadSuccess) {
        onUploadSuccess();
      }

      setTimeout(() => {
        setUploadSuccessMsg(null);
        setUploadFiles([]);
        setFileCategoryOverrides({});
        onClose();
      }, 1600);
    } catch (err: unknown) {
      setUploadProgressText(null);
      setUploadError(
        extractErrorMessage(
          err,
          "Failed to process curriculum documents. Please check backend connectivity."
        )
      );
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl max-h-[88vh] flex flex-col rounded-xl bg-white border border-stone-200 shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between shrink-0 bg-stone-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#B81104] text-[#FFFACD] flex items-center justify-center shadow-xs">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 id="upload-modal-title" className="text-sm sm:text-base font-extrabold text-stone-900 flex items-center gap-1.5">
                <span>Upload Curriculum</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-stone-200/80 text-stone-700">
                  {activeGradeName}
                </span>
              </h3>
              <p className="text-[11px] text-stone-500 font-medium">
                Bulk ingestion with chapter targeting and smart auto-category sorting
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenPdfStorage && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPdfStorage();
                }}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-[#B81104] bg-red-50 hover:bg-red-100/80 border border-red-200 transition-colors cursor-pointer"
                title="Open Cloudinary PDF Storage Manager"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Browse PDFs</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="w-7 h-7 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50"
              title="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {/* Notifications */}
          {uploadSuccessMsg && (
            <div className="p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{uploadSuccessMsg}</span>
            </div>
          )}

          {uploadError && (
            <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs font-bold text-red-800 flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Drag & Drop Zone (Compact) */}
          <div
            onClick={() => {
              if (!isUploading) {
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) {
                handleAddFiles(e.dataTransfer.files);
              }
            }}
            className={`relative p-4 sm:p-5 rounded-md border-2 border-dashed transition-all text-center space-y-1.5 cursor-pointer ${
              isDragging
                ? "border-[#B81104] bg-red-50/40 ring-4 ring-red-100"
                : "border-stone-300 hover:border-[#B81104] bg-stone-50/60 hover:bg-red-50/20"
            }`}
          >
            <div className="w-10 h-10 rounded-md bg-red-100 text-[#B81104] flex items-center justify-center mx-auto shadow-2xs">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-stone-800">
                Drop curriculum PDFs here or <span className="text-[#B81104] underline">browse files</span>
              </div>
              <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                Bulk upload multiple PDFs: Topics, Lab Activities, and Capstone Projects
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-0.5 text-[10px] font-semibold text-stone-500">
              <span className="flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-blue-600" /> Topics
              </span>
              <span className="flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-emerald-600" /> Activities
              </span>
              <span className="flex items-center gap-1">
                <Rocket className="w-3 h-3 text-red-600" /> Projects
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf"
              title=""
              tabIndex={-1}
              disabled={isUploading}
              onChange={(e) => {
                if (e.target.files) {
                  handleAddFiles(e.target.files);
                  e.target.value = "";
                }
              }}
              className="hidden"
            />
          </div>

          {/* Staged Configuration & Table (Visible when files are staged) */}
          {stagedRecords.length > 0 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Triple Controls: Grade, Chapter, and Category Sorting */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-lg bg-stone-50 border border-stone-200">
                {/* 1. Grade Selector */}
                <div className="sm:col-span-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-stone-800 uppercase tracking-wider block">
                      Target Grade
                    </label>
                  </div>
                  <SelectDropdown
                    size="sm"
                    value={String(selectedGradeMode)}
                    onChange={handleGradeChange}
                    options={gradeOptions}
                  />
                </div>

                {/* 2. Chapter Selector */}
                <div className="sm:col-span-5 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-stone-800 uppercase tracking-wider block">
                      Target Chapter
                    </label>
                  </div>
                  <SelectDropdown
                    size="sm"
                    value={selectedChapterMode}
                    onChange={(val) => setSelectedChapterMode(val)}
                    options={chapterOptions}
                  />

                  {/* Custom Chapter text input */}
                  {selectedChapterMode === "custom" && (
                    <div className="pt-1">
                      <input
                        type="text"
                        required
                        placeholder="e.g. Chapter 7: Arduino Microcontroller"
                        value={customChapterName}
                        onChange={(e) => setCustomChapterName(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded-md border border-stone-300 font-medium focus:outline-hidden focus:border-[#B81104] focus:ring-1 focus:ring-[#B81104]"
                      />
                    </div>
                  )}
                </div>

                {/* 3. Category Sorting Mode */}
                <div className="sm:col-span-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-stone-800 uppercase tracking-wider block">
                      Category Mode
                    </label>
                  </div>
                  <SelectDropdown
                    size="sm"
                    value={categoryMode}
                    onChange={(val) => {
                      setCategoryMode(val as "auto" | "Topic" | "Activity" | "Project");
                      setFileCategoryOverrides({});
                    }}
                    options={[
                      {
                        value: "auto",
                        label: "⚡ Auto-Sort Categories (Smart AI)",
                        sublabel: "Auto-detects from filenames",
                        badge: { text: "Smart AI", variant: "emerald" },
                      },
                      {
                        value: "Topic",
                        label: "Force All as Topic",
                        badge: { text: "Topic", variant: "blue" },
                      },
                      {
                        value: "Activity",
                        label: "Force All as Activity",
                        badge: { text: "Activity", variant: "emerald" },
                      },
                      {
                        value: "Project",
                        label: "Force All as Project",
                        badge: { text: "Project", variant: "purple" },
                      },
                    ]}
                  />
                </div>
              </div>

              {/* Auto Category Breakdown Pill Bar */}
              <div className="p-2.5 rounded-md bg-stone-100/80 border border-stone-200/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-stone-800">
                    Staged: {stagedRecords.length} Files
                  </span>
                  {categoryMode === "auto" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                      <span>Smart Auto-Sorted</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    <BookOpen className="w-2.5 h-2.5" />
                    <span>{categoryCounts.Topic} Topics</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <FlaskConical className="w-2.5 h-2.5" />
                    <span>{categoryCounts.Activity} Activities</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                    <Rocket className="w-2.5 h-2.5" />
                    <span>{categoryCounts.Project} Projects</span>
                  </span>
                </div>
              </div>

              {/* Scrollable File Items List with Complete Chapter & Document Data */}
              <div className="border border-stone-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                <div className="px-3.5 py-2 bg-stone-50 border-b border-stone-200 flex items-center justify-between text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                  <span>Document Details</span>
                  <div className="flex items-center gap-3">
                    <span>Category Assignment</span>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadFiles([]);
                        setFileCategoryOverrides({});
                      }}
                      className="text-stone-400 hover:text-red-600 font-semibold cursor-pointer lowercase"
                    >
                      clear all
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto divide-y divide-stone-100">
                  {stagedRecords.map((rec) => (
                    <div
                      key={rec.name}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-stone-50/70 transition-colors"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <FileText className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-xs sm:text-sm font-bold text-stone-900 leading-snug break-words" title={rec.title}>
                            {rec.title}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-stone-600 font-mono flex-wrap">
                            <span className="font-semibold text-stone-800 break-all">{rec.name}</span>
                            <span className="text-stone-300">&bull;</span>
                            <span className="text-stone-500 font-sans">{formatFileSize(rec.size)}</span>
                            <span className="text-stone-300">&bull;</span>
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold font-sans">
                              Grade {rec.grade}
                            </span>
                            <span className="text-stone-300">&bull;</span>
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-stone-100 text-stone-800 border border-stone-200 font-medium font-sans">
                              {rec.chapter}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Inline Category Switcher & Remove */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <select
                          value={rec.category}
                          onChange={(e) =>
                            handleSetFileCategory(
                              rec.name,
                              e.target.value as "Topic" | "Activity" | "Project"
                            )
                          }
                          className={`text-[10px] font-bold px-2 py-1 rounded-md border cursor-pointer focus:outline-hidden ${
                            rec.category === "Topic"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : rec.category === "Activity"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}
                        >
                          <option value="Topic">📘 Topic</option>
                          <option value="Activity">🔬 Activity</option>
                          <option value="Project">🚀 Project</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleRemoveFile(rec.name)}
                          disabled={isUploading}
                          className="w-6 h-6 rounded-md hover:bg-stone-100 text-stone-400 hover:text-red-600 flex items-center justify-center cursor-pointer transition-colors"
                          title="Remove file"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cloud Storage Option */}
              <div className="p-2.5 rounded-md bg-stone-50 border border-stone-200 flex items-center justify-between">
                <span className="font-semibold text-xs text-stone-800 flex items-center gap-2">
                  <Cloud className="w-3.5 h-3.5 text-[#B81104]" />
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
            <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-2 animate-in fade-in">
              <Loader2 className="w-3.5 h-3.5 text-[#B81104] animate-spin shrink-0" />
              <span>{uploadProgressText}</span>
            </div>
          )}
        </div>

        {/* Bottom Footer Action Controls */}
        <div className="px-4 py-2.5 border-t border-stone-100 bg-stone-50/70 flex items-center justify-between shrink-0">
          <div className="text-xs text-stone-500 font-medium">
            {stagedRecords.length > 0 ? (
              <span>
                Ready to upload <strong className="text-stone-800">{stagedRecords.length}</strong> {stagedRecords.length === 1 ? "document" : "documents"}
              </span>
            ) : (
              <span>No files selected</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-stone-600 hover:bg-stone-200/60 cursor-pointer disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleUploadSubmit}
              disabled={stagedRecords.length === 0 || isUploading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold text-[#FFFACD] bg-[#B81104] hover:bg-[#8F0D03] border border-[#8F0D03] shadow-xs disabled:opacity-50 cursor-pointer transition-all"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading & Sorting...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>
                    Upload {stagedRecords.length > 0 ? `(${stagedRecords.length} Files)` : ""}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
