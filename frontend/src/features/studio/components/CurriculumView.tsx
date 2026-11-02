"use client";

import React, { useState, useMemo } from "react";
import { CurriculumOverviewResponse } from "../../../lib/api";
import {
  CurriculumStatus,
  generateCurriculumVideoId,
  syncCurriculumSkeleton,
  sortChaptersNumerically,
} from "../../../lib/curriculum-api";
import { useCurriculumWorkspace, CurriculumWorkspaceHook } from "../../curriculum/hooks/useCurriculumWorkspace";
import { CurriculumMindMap } from "../../curriculum/components/CurriculumMindMap";
import { CurriculumTable } from "../../curriculum/components/CurriculumTable";
import { CurriculumToolbar } from "../../curriculum/components/CurriculumToolbar";
import { CurriculumNodeInspector } from "../../curriculum/components/CurriculumNodeInspector";
import { CurriculumImportModal } from "../../curriculum/components/CurriculumImportModal";
import { CurriculumPdfManager } from "../../curriculum/components/CurriculumPdfManager";
import { SelectDropdown } from "../../../components/ui";
import { CloudinaryAsset } from "../../../types";
import {
  Plus,
  Minus,
  AlertCircle,
  Check,
  X,
  Sparkles,
} from "lucide-react";

interface CurriculumViewProps {
  activeGradeId: number;
  activeGradeName: string;
  curriculum: CurriculumOverviewResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenUploadModal: () => void;
  onSelectTopicForQuiz: (topicId: string) => void;
  workspaceProp?: CurriculumWorkspaceHook;
  onOpenPdfStorage?: (grade?: number, chapter?: string) => void;
  onSelectAssetForAssessment?: (asset: CloudinaryAsset | CloudinaryAsset[]) => void;
}

export function CurriculumView({
  activeGradeId,
  activeGradeName,
  workspaceProp,
  onSelectTopicForQuiz,
  onOpenPdfStorage,
  onSelectAssetForAssessment,
}: CurriculumViewProps) {
  // Curriculum Workspace state (shared or real SQLite + WAL + SSE real-time sync)
  const internalWorkspace = useCurriculumWorkspace(workspaceProp ? null : activeGradeId);
  const workspace = workspaceProp || internalWorkspace;
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isPdfStorageOpen, setIsPdfStorageOpen] = useState<boolean>(false);

  // Toast notification state
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "info" } | null>(null);

  const showToast = (text: string, type: "success" | "info" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // New record form state
  const [newCount, setNewCount] = useState<string>(String(workspace.records.length + 1));
  const [newVideoId, setNewVideoId] = useState<string>("");
  const [newGrade, setNewGrade] = useState<number>(activeGradeId || 6);
  const [newChapter, setNewChapter] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string>("Topic");
  const [newStatus, setNewStatus] = useState<CurriculumStatus>("Not Started");
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isManualVideoId, setIsManualVideoId] = useState<boolean>(false);

  // Canonical curriculum categories: Topic, Activity, Project
  const availableCategories = useMemo(() => {
    return ["Topic", "Activity", "Project"];
  }, []);

  // Available chapters for PDF upload association (filtered by active grade)
  const availableChapters = useMemo(() => {
    const set = new Set<string>();
    workspace.records.forEach((r) => {
      if (r.chapter && r.chapter.trim()) {
        if (!activeGradeId || r.grade === activeGradeId) {
          set.add(r.chapter.trim());
        }
      }
    });
    return Array.from(set).sort(sortChaptersNumerically);
  }, [workspace.records, activeGradeId]);

  // Open creation modal with initial parameters and auto-generate Video ID
  const openCreateModal = (
    gradeOverride?: number,
    chapterOverride?: string,
    categoryOverride?: string
  ) => {
    const targetGrade = gradeOverride ?? (activeGradeId || 6);
    const targetChapter =
      chapterOverride !== undefined
        ? chapterOverride
        : workspace.records.find((r) => r.grade === targetGrade)?.chapter || "Chapter 1";
    const targetCategory = categoryOverride || "Topic";
    const nextCount = workspace.records.length + 1;

    setNewGrade(targetGrade);
    setNewChapter(targetChapter);
    setNewCategory(targetCategory);
    setNewCount(String(nextCount));
    setNewStatus("Not Started");

    const autoId = generateCurriculumVideoId(
      targetGrade,
      targetChapter,
      targetCategory,
      workspace.records
    );
    setNewVideoId(autoId);
    setIsManualVideoId(false);
    setIsCreateModalOpen(true);
  };

  // Synchronize auto-generated Video ID when Grade changes
  const handleGradeChange = (grade: number) => {
    setNewGrade(grade);
    if (!isManualVideoId) {
      const autoId = generateCurriculumVideoId(grade, newChapter, newCategory, workspace.records);
      setNewVideoId(autoId);
    }
  };

  // Synchronize auto-generated Video ID when Chapter changes
  const handleChapterChange = (chapter: string) => {
    setNewChapter(chapter);
    if (!isManualVideoId) {
      const autoId = generateCurriculumVideoId(newGrade, chapter, newCategory, workspace.records);
      setNewVideoId(autoId);
    }
  };

  // Synchronize auto-generated Video ID when Category changes
  const handleCategoryChange = (category: string) => {
    setNewCategory(category);
    if (!isManualVideoId) {
      const autoId = generateCurriculumVideoId(newGrade, newChapter, category, workspace.records);
      setNewVideoId(autoId);
    }
  };

  // User manual edits to Video ID
  const handleVideoIdChange = (id: string) => {
    setNewVideoId(id);
    if (!id.trim()) {
      setIsManualVideoId(false);
      const autoId = generateCurriculumVideoId(newGrade, newChapter, newCategory, workspace.records);
      setNewVideoId(autoId);
    } else {
      setIsManualVideoId(true);
    }
  };

  // Manual trigger to re-generate Video ID to standard nomenclature
  const handleRegenerateVideoId = () => {
    const autoId = generateCurriculumVideoId(newGrade, newChapter, newCategory, workspace.records);
    setNewVideoId(autoId);
    setIsManualVideoId(false);
  };

  // Handle Add Record submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoId.trim() || !newChapter.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const parsedCount = parseInt(newCount, 10);
      const count = !isNaN(parsedCount) && parsedCount >= 1 ? parsedCount : workspace.records.length + 1;
      const created = await workspace.createRecord({
        count,
        video_id: newVideoId.trim(),
        grade: newGrade,
        chapter: newChapter.trim(),
        category: newCategory.trim() || "Topic",
        status: newStatus,
      });

      if (created) {
        setIsCreateModalOpen(false);
        setNewVideoId("");
        setNewChapter("");
        setIsManualVideoId(false);
        setNewCount(String(workspace.records.length + 2));
        showToast(`Record ${created.video_id} created successfully!`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Pre-fill creation from Mind Map branch "+ Add" action
  const handleAddUnderNode = (grade: number, chapter: string, category: string) => {
    const catLower = (category || "").toLowerCase();
    const normalizedCategory =
      catLower === "activity" ? "Activity" : catLower === "project" ? "Project" : "Topic";
    openCreateModal(grade, chapter, normalizedCategory);
  };

  // Quick status toggle directly from Mind Map or Table
  const handleQuickStatusChange = async (videoId: string, nextStatus: CurriculumStatus) => {
    const updated = await workspace.updateRecord(videoId, { status: nextStatus });
    if (updated) {
      showToast(`${videoId} marked as "${nextStatus}"`);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification Notification Pill */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-md bg-stone-900 text-white text-xs font-bold shadow-2xl border border-stone-800 animate-in fade-in slide-in-from-top-3 duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg.text}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="p-1 rounded text-stone-400 hover:text-white ml-1 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Slim & Compact Curriculum Header Banner */}
      <div className="px-4 py-3 sm:px-5 sm:py-3.5 rounded-md bg-gradient-to-r from-[#B81104] via-[#A00F03] to-[#8F0D03] text-[#FFFACD] shadow-md shadow-[#B81104]/10 border border-[#8F0D03] flex flex-wrap items-center justify-between gap-3 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />

        {/* Left: Compact Grade Title */}
        <div className="relative z-10 flex items-center gap-3 min-w-0">
          <h2 className="text-base sm:text-lg font-black tracking-tight text-white whitespace-nowrap">
            {activeGradeName} Curriculum Engine
          </h2>
          <span className="hidden md:inline-block w-1 h-1 rounded-full bg-[#FFFACD]/40" />
          <span className="hidden md:inline-block text-xs font-medium text-[#FFFACD]/80 truncate">
            Interactive Mind Map &amp; Table
          </span>
        </div>

        {/* Right: Individual Status Capsule Pills matching exact pill design & New Record button */}
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          {/* Total Capsule */}
          <button
            type="button"
            onClick={() => workspace.setSelectedStatus(null)}
            title="Show all records"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
              workspace.selectedStatus === null
                ? "bg-white/20 border-white/50 text-white shadow-xs ring-1 ring-white/40"
                : "bg-white/10 border-white/25 text-white/90 hover:bg-white/15"
            }`}
          >
            <span>Total:</span>
            <span className="font-mono font-black">{workspace.records.length}</span>
          </button>

          {/* Done Capsule */}
          <button
            type="button"
            onClick={() =>
              workspace.setSelectedStatus(workspace.selectedStatus === "Done" ? null : "Done")
            }
            title="Filter Done records"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
              workspace.selectedStatus === "Done"
                ? "bg-emerald-950/70 border-emerald-400 text-emerald-200 shadow-xs ring-1 ring-emerald-400/50"
                : "bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#10b981] shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            <span>Done:</span>
            <span className="font-mono font-black">{workspace.summary?.by_status?.Done ?? 0}</span>
          </button>

          {/* In Prog Capsule */}
          <button
            type="button"
            onClick={() =>
              workspace.setSelectedStatus(
                workspace.selectedStatus === "In Progress" ? null : "In Progress"
              )
            }
            title="Filter In Progress records"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
              workspace.selectedStatus === "In Progress"
                ? "bg-blue-950/70 border-blue-400 text-blue-200 shadow-xs ring-1 ring-blue-400/50"
                : "bg-blue-950/40 border-blue-500/30 text-blue-300 hover:bg-blue-900/50"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#3b82f6] shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
            <span>In Prog:</span>
            <span className="font-mono font-black">
              {workspace.summary?.by_status?.["In Progress"] ?? 0}
            </span>
          </button>

          {/* On Hold Capsule */}
          <button
            type="button"
            onClick={() =>
              workspace.setSelectedStatus(
                workspace.selectedStatus === "On Hold" ? null : "On Hold"
              )
            }
            title="Filter On Hold records"
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
              workspace.selectedStatus === "On Hold"
                ? "bg-amber-950/70 border-amber-400 text-amber-200 shadow-xs ring-1 ring-amber-400/50"
                : "bg-amber-950/40 border-amber-500/30 text-amber-300 hover:bg-amber-900/50"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#f59e0b] shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <span>On Hold:</span>
            <span className="font-mono font-black">
              {workspace.summary?.by_status?.["On Hold"] ?? 0}
            </span>
          </button>

          {/* Compact Quick Add Button */}
          <button
            type="button"
            onClick={() => openCreateModal(activeGradeId || 6)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white text-[#B81104] hover:bg-[#FFFACD] text-xs font-black shadow-xs transition-colors cursor-pointer shrink-0 ml-1"
            title="Create a new curriculum record"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Record</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {workspace.error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">{workspace.error}</span>
          </div>
          <button
            type="button"
            onClick={() => workspace.setError(null)}
            className="text-xs font-bold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Centralized Workspace Toolbar */}
      <CurriculumToolbar
        viewMode={workspace.viewMode}
        setViewMode={workspace.setViewMode}
        searchQuery={workspace.searchQuery}
        setSearchQuery={workspace.setSearchQuery}
        selectedGrade={workspace.selectedGrade}
        setSelectedGrade={workspace.setSelectedGrade}
        selectedStatus={workspace.selectedStatus}
        setSelectedStatus={workspace.setSelectedStatus}
        selectedCategory={workspace.selectedCategory}
        setSelectedCategory={workspace.setSelectedCategory}
        availableCategories={availableCategories}
        clearFilters={workspace.clearFilters}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenPdfStorage={() => {
          if (onOpenPdfStorage) {
            onOpenPdfStorage(workspace.selectedGrade || activeGradeId);
          } else {
            setIsPdfStorageOpen(true);
          }
        }}
        onRefresh={() => workspace.refresh()}
        isSyncing={workspace.isSyncing}
        totalCount={workspace.records.length}
        filteredCount={workspace.filteredRecords.length}
      />

      {/* Standalone Mind Map View */}
      {workspace.viewMode === "mindmap" && (
        <CurriculumMindMap
          hierarchyRoot={workspace.hierarchyRoot}
          records={workspace.records}
          activeRecord={workspace.activeRecord}
          onSelectRecord={workspace.setActiveRecord}
          searchQuery={workspace.searchQuery}
          selectedGrade={workspace.selectedGrade}
          onAddUnderNode={handleAddUnderNode}
          onQuickStatusChange={handleQuickStatusChange}
          onDeleteRecord={workspace.deleteRecord}
          onSelectTopicForQuiz={onSelectTopicForQuiz}
          onOpenPdfStorage={(grade, chapter) => {
            if (onOpenPdfStorage) {
              onOpenPdfStorage(grade || workspace.selectedGrade || activeGradeId, chapter);
            } else {
              setIsPdfStorageOpen(true);
            }
          }}
          onSyncMasterSkeleton={async () => {
            try {
              await syncCurriculumSkeleton();
              await workspace.refresh();
              showToast("Master Curriculum Skeleton synced successfully!");
            } catch (err: unknown) {
              const e = err as { message?: string };
              showToast(e?.message || "Sync failed", "info");
            }
          }}
        />
      )}

      {/* Standalone Advanced Table View */}
      {workspace.viewMode === "table" && (
        <CurriculumTable
          records={workspace.filteredRecords}
          activeRecord={workspace.activeRecord}
          onSelectRecord={workspace.setActiveRecord}
          onUpdateRecord={workspace.updateRecord}
          onDeleteRecord={workspace.deleteRecord}
          selectedIds={workspace.selectedIds}
          onToggleSelectId={workspace.toggleSelectId}
          onSelectAll={workspace.selectAll}
          onClearSelection={workspace.clearSelection}
          onBulkUpdateStatus={workspace.bulkUpdateStatus}
          onBulkDelete={workspace.bulkDelete}
          sortField={workspace.sortField}
          sortDirection={workspace.sortDirection}
          onSort={workspace.setSorting}
          searchQuery={workspace.searchQuery}
        />
      )}

      {/* Slide-Out Node Inspector with Cloudinary PDF integration */}
      <CurriculumNodeInspector
        record={workspace.activeRecord}
        isOpen={Boolean(workspace.activeRecord)}
        onClose={() => workspace.setActiveRecord(null)}
        onSave={workspace.updateRecord}
        onDelete={workspace.deleteRecord}
        onOpenPdfStorage={(grade, chapter) => {
          if (onOpenPdfStorage) {
            onOpenPdfStorage(grade || activeGradeId, chapter);
          } else {
            setIsPdfStorageOpen(true);
          }
        }}
        onAssessRecord={(rec, asset) => {
          if (asset && onSelectAssetForAssessment) {
            onSelectAssetForAssessment(asset);
          } else {
            onSelectTopicForQuiz(rec.chapter || rec.video_id);
          }
        }}
      />

      {/* Validated CSV Import Modal */}
      <CurriculumImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={() => {
          workspace.refresh();
          showToast("Curriculum CSV imported successfully!");
        }}
      />

      {/* New Record Modal */}
      {isCreateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create New Curriculum Record"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md rounded-md bg-white border border-stone-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="text-base font-extrabold text-stone-900">Add Curriculum Record</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-7 h-7 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
              {/* 1. Grade */}
              <div>
                <SelectDropdown
                  label="Grade"
                  value={String(newGrade)}
                  onChange={(val) => handleGradeChange(parseInt(val, 10) || 1)}
                  options={[6, 7, 8, 9, 10, 11, 12].map((g) => ({
                    value: String(g),
                    label: `Grade ${g}`,
                  }))}
                  size="sm"
                />
              </div>

              {/* 2. Chapter Name */}
              <div className="space-y-1">
                <label className="font-bold text-stone-700">Chapter Name</label>
                <input
                  type="text"
                  value={newChapter}
                  onChange={(e) => handleChapterChange(e.target.value)}
                  placeholder="e.g. Chapter 1: Components of Food"
                  className="w-full px-3 py-2 rounded border border-stone-300 focus:outline-hidden focus:border-[#B81104] focus:ring-1 focus:ring-[#B81104]"
                  required
                />
              </div>

              {/* 3. Category / Type */}
              <div>
                <SelectDropdown
                  label="Category / Type"
                  value={newCategory}
                  onChange={handleCategoryChange}
                  options={[
                    { value: "Topic", label: "Topic" },
                    { value: "Activity", label: "Activity" },
                    { value: "Project", label: "Project" },
                  ]}
                  size="sm"
                />
              </div>

              {/* 4. Video ID (Unique Identifier) - Structured Nomenclature */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-stone-700">Video ID (Unique Identifier)</label>
                  <span className="text-[10px] text-stone-400 font-mono">
                    Grade • Chapter • Category
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={newVideoId}
                    onChange={(e) => handleVideoIdChange(e.target.value)}
                    placeholder="e.g. G6-C1-T01"
                    className="w-full px-3 py-2 pr-18 rounded border border-stone-300 font-mono font-bold text-stone-800 focus:outline-hidden focus:border-[#B81104] focus:ring-1 focus:ring-[#B81104]"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateVideoId}
                    className="absolute right-1.5 px-2 py-1 rounded text-[10px] font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center gap-1 transition-colors cursor-pointer border border-stone-200"
                    title="Auto-generate ID following standard nomenclature (Grade-Chapter-Category)"
                  >
                    <Sparkles className="w-3 h-3 text-[#B81104]" />
                    <span>Auto</span>
                  </button>
                </div>
                <p className="text-[10.5px] text-stone-500 font-medium leading-relaxed">
                  Nomenclature: <span className="font-mono font-semibold text-stone-700">G[Grade]-C[Chapter]-[Category][Seq]</span> (e.g. <span className="font-mono font-bold text-[#B81104]">G6-C1-T01</span> for Topic, <span className="font-mono font-bold text-[#B81104]">G6-C1-A01</span> for Activity, <span className="font-mono font-bold text-[#B81104]">G6-C1-P01</span> for Project)
                </p>
              </div>

              {/* 5. Sequence / Order Index */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-stone-700">Sr. No. / Sequence (#)</label>
                  <span className="text-[10px] text-stone-400">Order in syllabus</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseInt(newCount, 10) || 1;
                      if (cur > 1) setNewCount(String(cur - 1));
                    }}
                    className="w-9 h-9 rounded border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="Decrease sequence number"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newCount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setNewCount(val);
                    }}
                    onBlur={() => {
                      if (!newCount || parseInt(newCount, 10) < 1) {
                        setNewCount("1");
                      }
                    }}
                    placeholder="e.g. 1"
                    className="flex-1 px-3 py-2 rounded border border-stone-300 font-mono font-bold text-stone-800 text-center focus:outline-hidden focus:border-[#B81104] focus:ring-1 focus:ring-[#B81104]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur = parseInt(newCount, 10) || 0;
                      setNewCount(String(cur + 1));
                    }}
                    className="w-9 h-9 rounded border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold flex items-center justify-center cursor-pointer transition-colors"
                    title="Increase sequence number"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 6. Workflow Status */}
              <div>
                <SelectDropdown
                  label="Workflow Status"
                  value={newStatus}
                  onChange={(val) => setNewStatus(val as CurriculumStatus)}
                  options={[
                    { value: "Not Started", label: "Not Started", badge: { text: "Not Started", variant: "slate" } },
                    { value: "In Progress", label: "In Progress", badge: { text: "In Progress", variant: "blue" } },
                    { value: "Done", label: "Done", badge: { text: "Done", variant: "emerald" } },
                    { value: "On Hold", label: "On Hold", badge: { text: "On Hold", variant: "amber" } },
                  ]}
                  size="sm"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded text-stone-600 font-bold hover:bg-stone-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 rounded bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] font-black shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Create Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Cloudinary Curriculum PDF Storage & Asset Manager Modal */}
      <CurriculumPdfManager
        isOpen={isPdfStorageOpen}
        onClose={() => setIsPdfStorageOpen(false)}
        initialGrade={activeGradeId}
        availableChapters={availableChapters}
        records={workspace.records}
      />
    </div>
  );
}
