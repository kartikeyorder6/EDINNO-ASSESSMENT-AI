"use client";

import React from "react";
import {
  CurriculumStatus,
  CURRICULUM_STATUSES,
  getCurriculumExportCsvUrl,
} from "../../../lib/curriculum-api";
import { ViewMode } from "../hooks/useCurriculumWorkspace";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  CurriculumStatusBadge,
} from "../../../components/ui";
import {
  Search,
  Download,
  Upload,
  Cloud,
  RefreshCw,
  GitBranch,
  Table as TableIcon,
  ChevronDown,
  X,
} from "lucide-react";

interface CurriculumToolbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedGrade: number | null;
  setSelectedGrade: (grade: number | null) => void;
  selectedStatus: CurriculumStatus | null;
  setSelectedStatus: (status: CurriculumStatus | null) => void;
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;
  availableCategories: string[];
  clearFilters: () => void;
  onOpenImport: () => void;
  onOpenPdfStorage?: () => void;
  onRefresh: () => void;
  isSyncing: boolean;
  totalCount: number;
  filteredCount: number;
}

export function CurriculumToolbar({
  viewMode,
  setViewMode,
  searchQuery,
  setSearchQuery,
  selectedGrade,
  setSelectedGrade,
  selectedStatus,
  setSelectedStatus,
  selectedCategory,
  setSelectedCategory,
  availableCategories,
  clearFilters,
  onOpenImport,
  onOpenPdfStorage,
  onRefresh,
  isSyncing,
  totalCount,
  filteredCount,
}: CurriculumToolbarProps) {
  const hasActiveFilters =
    Boolean(searchQuery) || selectedGrade !== null || selectedStatus !== null || selectedCategory !== null;

  return (
    <div className="space-y-3 p-4 rounded-md bg-white border border-stone-200 shadow-xs">
      {/* Top Bar: View Mode Switcher + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: View Mode Toggle Tabs */}
        <div className="flex items-center p-1 rounded-md bg-stone-100 border border-stone-200">
          <button
            type="button"
            onClick={() => setViewMode("mindmap")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
              viewMode === "mindmap"
                ? "bg-white text-stone-900 shadow-xs"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            <GitBranch className="w-3.5 h-3.5 text-[#B81104]" />
            <span>Mind Map</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
              viewMode === "table"
                ? "bg-white text-stone-900 shadow-xs"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            <TableIcon className="w-3.5 h-3.5 text-[#B81104]" />
            <span>Advanced Table</span>
          </button>
        </div>

        {/* Right: Import / Export / Refresh */}
        <div className="flex items-center gap-2">
          {/* CSV Import */}
          <button
            type="button"
            onClick={onOpenImport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-extrabold shadow-2xs transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#B81104]" />
            <span>Import CSV</span>
          </button>

          {/* CSV Export (Strict 6 Fields) */}
          <a
            href={getCurriculumExportCsvUrl({
              grade: selectedGrade || undefined,
              status: selectedStatus || undefined,
            })}
            download="curriculum_export.csv"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-extrabold shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </a>

          {/* Cloudinary PDF Storage */}
          {onOpenPdfStorage && (
            <button
              type="button"
              onClick={onOpenPdfStorage}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-extrabold shadow-2xs transition-all cursor-pointer"
              title="Cloudinary PDF Storage & Chapter Asset Manager"
            >
              <Cloud className="w-3.5 h-3.5 text-[#B81104]" />
              <span>PDF Storage</span>
            </button>
          )}

          {/* Live Sync Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600 text-xs font-bold cursor-pointer transition-all"
            title="Reconcile with real-time SSE database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-[#B81104]" : ""}`} />
            <span className="hidden sm:inline">{isSyncing ? "Syncing..." : "Sync"}</span>
          </button>
        </div>
      </div>

      {/* Bottom Bar: Search + Grade / Status / Category Filters */}
      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-stone-100">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Video ID, Chapter, Category..."
            className="w-full pl-9 pr-3 py-1.5 rounded border border-stone-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#B81104]/20 focus:border-[#B81104] bg-stone-50/50"
          />
        </div>

        {/* Grade Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold cursor-pointer shadow-2xs transition-all ${
                selectedGrade !== null
                  ? "border-[#B81104]/50 bg-red-50/60 text-[#8F0D03] ring-1 ring-[#B81104]/20"
                  : "border-stone-200 text-stone-700 bg-white hover:bg-stone-50"
              }`}
            >
              <span>{selectedGrade !== null ? `Grade ${selectedGrade}` : "All Grades"}</span>
              <ChevronDown className="w-3 h-3 text-stone-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" width="w-36">
            <DropdownMenuLabel>Filter by Grade</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSelectedGrade(null)}>
              <span className={selectedGrade === null ? "font-black text-[#B81104]" : ""}>All Grades</span>
            </DropdownMenuItem>
            {[6, 7, 8, 9, 10, 11, 12].map((g) => (
              <DropdownMenuItem key={g} onClick={() => setSelectedGrade(g)}>
                <span className={selectedGrade === g ? "font-black text-[#B81104]" : ""}>Grade {g}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold cursor-pointer shadow-2xs transition-all ${
                selectedStatus !== null
                  ? "border-[#B81104]/50 bg-red-50/60 text-[#8F0D03] ring-1 ring-[#B81104]/20"
                  : "border-stone-200 text-stone-700 bg-white hover:bg-stone-50"
              }`}
            >
              {selectedStatus ? (
                <CurriculumStatusBadge status={selectedStatus} size="sm" />
              ) : (
                <span>All Statuses</span>
              )}
              <ChevronDown className="w-3 h-3 text-stone-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" width="w-40">
            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSelectedStatus(null)}>
              <span className={selectedStatus === null ? "font-black text-[#B81104]" : ""}>All Statuses</span>
            </DropdownMenuItem>
            {CURRICULUM_STATUSES.map((st) => (
              <DropdownMenuItem key={st} onClick={() => setSelectedStatus(st)}>
                <CurriculumStatusBadge status={st} size="sm" />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Category Filter */}
        {availableCategories.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-bold cursor-pointer shadow-2xs transition-all ${
                  selectedCategory !== null
                    ? "border-[#B81104]/50 bg-red-50/60 text-[#8F0D03] ring-1 ring-[#B81104]/20"
                    : "border-stone-200 text-stone-700 bg-white hover:bg-stone-50"
                }`}
              >
                <span>{selectedCategory || "All Categories"}</span>
                <ChevronDown className="w-3 h-3 text-stone-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" width="w-44">
              <DropdownMenuLabel>Filter by Category</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setSelectedCategory(null)}>
                <span className={!selectedCategory ? "font-black text-[#B81104]" : ""}>All Categories</span>
              </DropdownMenuItem>
              {availableCategories.map((c) => (
                <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                  <span className={selectedCategory === c ? "font-black text-[#B81104]" : ""}>{c}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-bold text-[#B81104] hover:bg-red-50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}

        {/* Filter count telemetry */}
        <div className="ml-auto text-xs font-bold text-stone-400">
          Showing <span className="text-stone-900">{filteredCount}</span> of {totalCount} records
        </div>
      </div>
    </div>
  );
}

