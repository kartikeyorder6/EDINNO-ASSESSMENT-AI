"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  CurriculumRecord,
  CurriculumRecordUpdate,
  CurriculumStatus,
  CURRICULUM_STATUSES,
} from "../../../lib/curriculum-api";
import {
  Checkbox,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  CurriculumStatusBadge,
} from "../../../components/ui";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Check,
  X,
  Copy,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileSpreadsheet,
} from "lucide-react";

export type RowDensity = "compact" | "standard" | "relaxed";

export interface ColumnVisibility {
  count: boolean;
  video_id: boolean;
  grade: boolean;
  chapter: boolean;
  category: boolean;
  status: boolean;
  actions: boolean;
}

interface CurriculumTableProps {
  records: CurriculumRecord[];
  activeRecord: CurriculumRecord | null;
  onSelectRecord: (record: CurriculumRecord) => void;
  onUpdateRecord: (
    videoId: string,
    update: CurriculumRecordUpdate
  ) => Promise<CurriculumRecord | null>;
  onDeleteRecord: (videoId: string) => Promise<boolean>;
  selectedIds: Set<string>;
  onToggleSelectId: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkUpdateStatus: (status: CurriculumStatus) => Promise<boolean>;
  onBulkDelete: () => Promise<boolean>;
  sortField: keyof CurriculumRecord;
  sortDirection: "asc" | "desc";
  onSort: (field: keyof CurriculumRecord) => void;
  searchQuery?: string;
  onHoverRecord?: (videoId: string | null) => void;
}

export function CurriculumTable({
  records,
  activeRecord,
  onSelectRecord,
  onUpdateRecord,
  onDeleteRecord,
  selectedIds,
  onToggleSelectId,
  onSelectAll,
  onClearSelection,
  onBulkUpdateStatus,
  onBulkDelete,
  sortField,
  sortDirection,
  onSort,
  searchQuery = "",
  onHoverRecord,
}: CurriculumTableProps) {
  // Density and Column Visibility
  const [density, setDensity] = useState<RowDensity>("standard");
  const [showColumnMenu, setShowColumnMenu] = useState<boolean>(false);
  const [columns, setColumns] = useState<ColumnVisibility>({
    count: true,
    video_id: true,
    grade: true,
    chapter: true,
    category: true,
    status: true,
    actions: true,
  });

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Copied indicator state: videoId -> timestamp
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inline editing state: editing cell of a specific video_id and field
  const [editingCell, setEditingCell] = useState<{
    videoId: string;
    field: "count" | "grade" | "chapter" | "category";
  } | null>(null);
  const [inlineValue, setInlineValue] = useState<string>("");

  // Row refs for bi-directional auto-scroll
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // Bi-directional sync: smoothly scroll to activeRecord row when changed
  useEffect(() => {
    if (activeRecord?.video_id && rowRefs.current[activeRecord.video_id]) {
      rowRefs.current[activeRecord.video_id]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeRecord]);

  // Paginated records with derived safe page
  const totalPages = Math.max(1, Math.ceil(records.length / (pageSize === 0 ? records.length || 1 : pageSize)));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const visibleRecords = useMemo(() => {
    if (pageSize === 0) return records; // 0 = All
    const start = (safePage - 1) * pageSize;
    return records.slice(start, start + pageSize);
  }, [records, safePage, pageSize]);

  // Copy Video ID with toast feedback
  const handleCopyVideoId = (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(videoId);
    setCopiedId(videoId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Copy whole table formatted as TSV (for Excel / Google Sheets)
  const handleCopyTableTSV = () => {
    const header = ["Count", "Video ID", "Grade", "Chapter", "Category", "Status"].join("\t");
    const rows = records.map((r) =>
      [r.count, r.video_id, r.grade, `"${r.chapter}"`, `"${r.category}"`, r.status].join("\t")
    );
    const tsv = [header, ...rows].join("\n");
    navigator.clipboard.writeText(tsv);
    setCopiedId("__TABLE_COPIED__");
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Inline edit handlers
  const startInlineEdit = (
    record: CurriculumRecord,
    field: "count" | "grade" | "chapter" | "category",
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setEditingCell({ videoId: record.video_id, field });
    setInlineValue(String(record[field]));
  };

  const saveInlineEdit = async (record: CurriculumRecord) => {
    if (!editingCell) return;
    const { field } = editingCell;

    let parsedVal: string | number = inlineValue;
    if (field === "count" || field === "grade") {
      const num = parseInt(inlineValue, 10);
      if (isNaN(num)) return setEditingCell(null);
      parsedVal = num;
    }

    if (parsedVal !== record[field]) {
      await onUpdateRecord(record.video_id, { [field]: parsedVal });
    }
    setEditingCell(null);
  };

  // Status Change handler
  const handleStatusChange = async (
    record: CurriculumRecord,
    newStatus: CurriculumStatus,
    e?: React.SyntheticEvent
  ) => {
    if (e) e.stopPropagation();
    await onUpdateRecord(record.video_id, { status: newStatus });
  };

  // Sort indicator helper
  const renderSortIndicator = (field: keyof CurriculumRecord) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-stone-300 ml-1 inline" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#B81104] ml-1 inline" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#B81104] ml-1 inline" />
    );
  };

  // Search highlighter
  const highlightSearch = (text: string | number) => {
    const str = String(text ?? "");
    if (!searchQuery.trim()) return str;

    const parts = str.split(new RegExp(`(${searchQuery})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <mark key={i} className="bg-amber-200 text-stone-900 rounded-xs px-0.5 font-bold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Row padding classes based on density
  const rowPaddingClass =
    density === "compact"
      ? "py-2 px-3 text-[11px]"
      : density === "relaxed"
      ? "py-4 px-4 text-sm"
      : "py-3 px-4 text-xs";

  const isAllSelected = records.length > 0 && selectedIds.size === records.length;
  const isPartialSelected = selectedIds.size > 0 && selectedIds.size < records.length;

  return (
    <div className="relative rounded-md bg-white border border-stone-200 shadow-xs overflow-hidden flex flex-col">
      {/* Table Top Controls Bar (Density, Columns, Copy, Record Counts) */}
      <div className="p-3 bg-stone-50/75 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Record Counts & Active Selection */}
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-stone-900">
            {records.length} <span className="font-normal text-stone-500">records</span>
          </span>
          {selectedIds.size > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#B81104]/10 text-[#B81104] font-bold text-[11px]">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {/* Right: Actions (Density, Columns Visibility, Copy TSV) */}
        <div className="flex items-center gap-2">
          {/* Density Toggle */}
          <div className="flex items-center p-0.5 rounded bg-stone-200/60 border border-stone-200 text-[11px] font-bold text-stone-600">
            <button
              type="button"
              onClick={() => setDensity("compact")}
              title="Compact rows"
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                density === "compact" ? "bg-white text-stone-900 shadow-2xs" : "hover:text-stone-900"
              }`}
            >
              Dense
            </button>
            <button
              type="button"
              onClick={() => setDensity("standard")}
              title="Standard rows"
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                density === "standard" ? "bg-white text-stone-900 shadow-2xs" : "hover:text-stone-900"
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setDensity("relaxed")}
              title="Relaxed rows"
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                density === "relaxed" ? "bg-white text-stone-900 shadow-2xs" : "hover:text-stone-900"
              }`}
            >
              Spacious
            </button>
          </div>

          {/* Column Visibility Menu Button */}
          <DropdownMenu open={showColumnMenu} onOpenChange={setShowColumnMenu}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
              >
                <Eye className="w-3.5 h-3.5 text-stone-500" />
                <span>Columns</span>
                <ChevronDown className="w-3 h-3 text-stone-400" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" width="w-48">
              <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
              {Object.keys(columns).map((colKey) => (
                <DropdownMenuCheckboxItem
                  key={colKey}
                  checked={columns[colKey as keyof ColumnVisibility]}
                  onCheckedChange={(checked) =>
                    setColumns((prev) => ({
                      ...prev,
                      [colKey]: checked,
                    }))
                  }
                >
                  <span className="capitalize">{colKey.replace("_", " ")}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Copy Table to Clipboard TSV */}
          <button
            type="button"
            onClick={handleCopyTableTSV}
            title="Copy all records to clipboard for Google Sheets / Excel"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
          >
            {copiedId === "__TABLE_COPIED__" ? (
              <>
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-stone-500" />
                <span>Copy TSV</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Table Scroll Container */}
      <div className="overflow-x-auto min-h-[380px]">
        <table className="w-full text-left border-collapse">
          {/* Sticky Table Header */}
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/90 backdrop-blur-xs text-stone-700 text-[11px] font-black uppercase tracking-wider select-none sticky top-0 z-10">
              {/* Checkbox column */}
              <th className="py-3 px-4 w-12 text-center">
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isPartialSelected}
                  onChange={() => (isAllSelected ? onClearSelection() : onSelectAll())}
                  aria-label="Select all records"
                />
              </th>

              {/* 1. Count */}
              {columns.count && (
                <th
                  onClick={() => onSort("count")}
                  className="py-3 px-4 cursor-pointer hover:bg-stone-100 transition-colors w-20"
                >
                  <span>#</span>
                  {renderSortIndicator("count")}
                </th>
              )}

              {/* 2. Video ID */}
              {columns.video_id && (
                <th
                  onClick={() => onSort("video_id")}
                  className="py-3 px-4 cursor-pointer hover:bg-stone-100 transition-colors min-w-[140px]"
                >
                  <span>Video ID</span>
                  {renderSortIndicator("video_id")}
                </th>
              )}

              {/* 3. Grade */}
              {columns.grade && (
                <th
                  onClick={() => onSort("grade")}
                  className="py-3 px-4 cursor-pointer hover:bg-stone-100 transition-colors w-24"
                >
                  <span>Grade</span>
                  {renderSortIndicator("grade")}
                </th>
              )}

              {/* 4. Chapter */}
              {columns.chapter && (
                <th
                  onClick={() => onSort("chapter")}
                  className="py-3 px-4 cursor-pointer hover:bg-stone-100 transition-colors min-w-[220px]"
                >
                  <span>Chapter</span>
                  {renderSortIndicator("chapter")}
                </th>
              )}

              {/* 5. Category */}
              {columns.category && (
                <th
                  onClick={() => onSort("category")}
                  className="py-3 px-4 cursor-pointer hover:bg-stone-100 transition-colors w-36"
                >
                  <span>Category</span>
                  {renderSortIndicator("category")}
                </th>
              )}

              {/* 6. Status */}
              {columns.status && (
                <th
                  onClick={() => onSort("status")}
                  className="py-3 px-4 cursor-pointer hover:bg-stone-100 transition-colors w-40"
                >
                  <span>Status</span>
                  {renderSortIndicator("status")}
                </th>
              )}

              {/* Row Actions */}
              {columns.actions && <th className="py-3 px-4 text-right w-28">Action</th>}
            </tr>
          </thead>

          <tbody className="divide-y divide-stone-100 font-sans">
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={Object.values(columns).filter(Boolean).length + 1}
                  className="py-16 text-center text-stone-400 font-medium space-y-2"
                >
                  <div className="w-10 h-10 rounded-md bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-stone-700">No records found</p>
                  <p className="text-xs text-stone-400">
                    No curriculum records match your active search or filters.
                  </p>
                </td>
              </tr>
            ) : (
              visibleRecords.map((r) => {
                const isSelected = selectedIds.has(r.video_id);
                const isActive = activeRecord?.video_id === r.video_id;

                return (
                  <tr
                    key={r.video_id}
                    ref={(el) => {
                      rowRefs.current[r.video_id] = el;
                    }}
                    onClick={() => onSelectRecord(r)}
                    onMouseEnter={() => onHoverRecord?.(r.video_id)}
                    onMouseLeave={() => onHoverRecord?.(null)}
                    className={`transition-colors cursor-pointer group ${
                      isActive
                        ? "bg-red-50/70 border-l-4 border-l-[#B81104] font-semibold"
                        : isSelected
                        ? "bg-stone-50"
                        : "hover:bg-stone-50/60"
                    }`}
                  >
                    {/* Checkbox */}
                    <td
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelectId(r.video_id);
                      }}
                      className={`${rowPaddingClass} text-center`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={() => onToggleSelectId(r.video_id)}
                        aria-label={`Select record ${r.video_id}`}
                      />
                    </td>

                    {/* 1. Count */}
                    {columns.count && (
                      <td
                        onDoubleClick={(e) => startInlineEdit(r, "count", e)}
                        className={`${rowPaddingClass} font-mono text-stone-500`}
                      >
                        {editingCell?.videoId === r.video_id && editingCell.field === "count" ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="number"
                              value={inlineValue}
                              onChange={(e) => setInlineValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlineEdit(r);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              autoFocus
                              className="w-16 px-1.5 py-0.5 rounded border border-[#B81104] text-xs font-mono bg-white shadow-xs"
                            />
                            <button
                              type="button"
                              onClick={() => saveInlineEdit(r)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span>{highlightSearch(r.count)}</span>
                        )}
                      </td>
                    )}

                    {/* 2. Video ID */}
                    {columns.video_id && (
                      <td className={`${rowPaddingClass} font-mono font-bold text-stone-900`}>
                        <div className="flex items-center gap-1.5">
                          <span>{highlightSearch(r.video_id)}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyVideoId(r.video_id, e)}
                            title="Copy Video ID"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-opacity"
                          >
                            {copiedId === r.video_id ? (
                              <CheckCheck className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}

                    {/* 3. Grade */}
                    {columns.grade && (
                      <td
                        onDoubleClick={(e) => startInlineEdit(r, "grade", e)}
                        className={rowPaddingClass}
                      >
                        {editingCell?.videoId === r.video_id && editingCell.field === "grade" ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={inlineValue}
                              onChange={(e) => setInlineValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlineEdit(r);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              autoFocus
                              className="w-14 px-1.5 py-0.5 rounded border border-[#B81104] text-xs font-mono bg-white shadow-xs"
                            />
                            <button
                              type="button"
                              onClick={() => saveInlineEdit(r)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-bold text-[11px] border border-stone-200">
                            Grade {r.grade}
                          </span>
                        )}
                      </td>
                    )}

                    {/* 4. Chapter */}
                    {columns.chapter && (
                      <td
                        onDoubleClick={(e) => startInlineEdit(r, "chapter", e)}
                        className={`${rowPaddingClass} font-medium text-stone-800`}
                      >
                        {editingCell?.videoId === r.video_id && editingCell.field === "chapter" ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={inlineValue}
                              onChange={(e) => setInlineValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlineEdit(r);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              autoFocus
                              className="w-full px-2 py-0.5 rounded border border-[#B81104] text-xs bg-white shadow-xs"
                            />
                            <button
                              type="button"
                              onClick={() => saveInlineEdit(r)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span>{highlightSearch(r.chapter)}</span>
                        )}
                      </td>
                    )}

                    {/* 5. Category */}
                    {columns.category && (
                      <td
                        onDoubleClick={(e) => startInlineEdit(r, "category", e)}
                        className={`${rowPaddingClass} text-stone-600`}
                      >
                        {editingCell?.videoId === r.video_id && editingCell.field === "category" ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={inlineValue}
                              onChange={(e) => setInlineValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlineEdit(r);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              autoFocus
                              className="px-2 py-0.5 rounded border border-[#B81104] text-xs bg-white shadow-xs font-semibold text-stone-800 focus:outline-none cursor-pointer"
                            >
                              <option value="Topic">Topic</option>
                              <option value="Activity">Activity</option>
                              <option value="Project">Project</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => saveInlineEdit(r)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                              title="Save Category"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded bg-stone-100 text-[11px] font-semibold text-stone-700 border border-stone-200">
                            {highlightSearch(r.category)}
                          </span>
                        )}
                      </td>
                    )}

                    {/* 6. Status (Interactive Dropdown Menu) */}
                    {columns.status && (
                      <td className={rowPaddingClass} onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-1 group/btn hover:ring-1 hover:ring-stone-300 rounded p-0.5 transition-all cursor-pointer"
                              title="Click to change status"
                            >
                              <CurriculumStatusBadge status={r.status} size="sm" />
                              <ChevronDown className="w-3 h-3 text-stone-400 group-hover/btn:text-stone-700" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" width="w-36">
                            <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                            {CURRICULUM_STATUSES.map((st) => (
                              <DropdownMenuItem
                                key={st}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(r, st);
                                }}
                              >
                                <CurriculumStatusBadge status={st} size="sm" />
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}

                    {/* Row Action */}
                    {columns.actions && (
                      <td
                        className={`${rowPaddingClass} text-right`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {/* Inspect / Edit */}
                          <button
                            type="button"
                            onClick={() => onSelectRecord(r)}
                            className="p-1.5 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                            title="Open in Inspector"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete record ${r.video_id}?`)) {
                                onDeleteRecord(r.video_id);
                              }
                            }}
                            className="p-1.5 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {records.length > 0 && (
        <div className="p-3 bg-stone-50/75 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left: Showing range */}
          <div className="text-stone-500 font-medium">
            Showing{" "}
            <span className="font-bold text-stone-800">
              {pageSize === 0 ? 1 : (safePage - 1) * pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-bold text-stone-800">
              {pageSize === 0 ? records.length : Math.min(safePage * pageSize, records.length)}
            </span>{" "}
            of <span className="font-bold text-stone-800">{records.length}</span> records
          </div>

          {/* Right: Page Size Selector & Navigation Buttons */}
          <div className="flex items-center gap-2">
            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-stone-500">
              <span>Show:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-stone-300 text-stone-800 font-bold text-xs cursor-pointer hover:bg-stone-50 shadow-2xs"
                  >
                    <span>{pageSize === 0 ? "All" : pageSize}</span>
                    <ChevronDown className="w-3 h-3 text-stone-500" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" width="w-24">
                  <DropdownMenuLabel>Page Size</DropdownMenuLabel>
                  {[10, 25, 50, 100, 0].map((size) => (
                    <DropdownMenuItem
                      key={size}
                      onClick={() => {
                        setPageSize(size);
                        setCurrentPage(1);
                      }}
                    >
                      <span className={pageSize === size ? "font-black text-[#B81104]" : ""}>
                        {size === 0 ? "All" : size}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Navigation Buttons (if not showing All) */}
            {pageSize > 0 && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(1)}
                  title="First Page"
                  className="p-1.5 rounded-md border border-stone-300 bg-white hover:bg-stone-50 text-stone-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                  title="Previous Page"
                  className="p-1.5 rounded-md border border-stone-300 bg-white hover:bg-stone-50 text-stone-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <span className="px-2 font-bold text-stone-700">
                  {safePage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                  title="Next Page"
                  className="p-1.5 rounded-md border border-stone-300 bg-white hover:bg-stone-50 text-stone-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title="Last Page"
                  className="p-1.5 rounded-md border border-stone-300 bg-white hover:bg-stone-50 text-stone-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 mx-4 mb-4 flex items-center justify-between p-3 rounded-md bg-stone-900 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 z-20">
          <div className="flex items-center gap-2 text-xs font-bold pl-2">
            <span className="w-6 h-6 rounded bg-[#B81104] text-[#FFFACD] flex items-center justify-center text-xs">
              {selectedIds.size}
            </span>
            <span>records selected</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Bulk Status Select */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-stone-800 text-white border border-stone-700 text-xs font-bold cursor-pointer hover:bg-stone-700 transition-colors shadow-2xs"
                >
                  <span>Change Status...</span>
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" width="w-40">
                <DropdownMenuLabel>Bulk Set Status</DropdownMenuLabel>
                {CURRICULUM_STATUSES.map((st) => (
                  <DropdownMenuItem
                    key={st}
                    onClick={() => onBulkUpdateStatus(st)}
                  >
                    <CurriculumStatusBadge status={st} size="sm" />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Bulk Delete */}
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete all ${selectedIds.size} selected records?`)) {
                  onBulkDelete();
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            {/* Deselect */}
            <button
              type="button"
              onClick={onClearSelection}
              className="p-1.5 rounded text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
