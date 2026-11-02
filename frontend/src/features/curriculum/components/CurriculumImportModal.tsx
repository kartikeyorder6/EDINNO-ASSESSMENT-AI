"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  previewCurriculumCSVImport,
  commitCurriculumCSVImport,
  syncCurriculumSkeleton,
  importCurriculumExcel,
  CurriculumImportPreviewResponse,
  CurriculumRecordInput,
} from "../../../lib/curriculum-api";
import {
  UploadCloud,
  X,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  Info,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

interface CurriculumImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

export function CurriculumImportModal({
  isOpen,
  onClose,
  onImportSuccess,
}: CurriculumImportModalProps) {
  const [, setSelectedFile] = useState<File | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [preview, setPreview] = useState<CurriculumImportPreviewResponse | null>(null);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRecords: CurriculumRecordInput[] = useMemo(() => {
    if (!preview) return [];
    return preview.previews
      .filter((p) => p.is_valid && p.record)
      .map((p) => p.record as CurriculumRecordInput);
  }, [preview]);

  const allErrors: string[] = useMemo(() => {
    if (!preview) return [];
    return preview.previews.flatMap((p) => p.errors);
  }, [preview]);

  const allIgnoredColumns: string[] = useMemo(() => {
    if (!preview) return [];
    return Array.from(new Set(preview.previews.flatMap((p) => p.ignored_obsolete_fields)));
  }, [preview]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const [isSyncingSkeleton, setIsSyncingSkeleton] = useState<boolean>(false);
  const [isImportingExcel, setIsImportingExcel] = useState<boolean>(false);
  const [excelSuccessMsg, setExcelSuccessMsg] = useState<string | null>(null);

  const handleSyncSkeleton = async () => {
    setIsSyncingSkeleton(true);
    setErrorMsg(null);
    try {
      const res = await syncCurriculumSkeleton();
      setExcelSuccessMsg(res.message || "Master Curriculum Skeleton synced successfully!");
      setTimeout(() => {
        onImportSuccess();
        onClose();
      }, 1000);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to sync master curriculum skeleton.");
    } finally {
      setIsSyncingSkeleton(false);
    }
  };

  const handleFile = async (file: File) => {
    const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xlsm");
    const isCsv = file.name.endsWith(".csv");

    if (!isXlsx && !isCsv) {
      setErrorMsg("Please upload a valid .xlsx or .csv curriculum file.");
      return;
    }

    setSelectedFile(file);
    setErrorMsg(null);

    if (isXlsx) {
      setIsImportingExcel(true);
      try {
        const res = await importCurriculumExcel(file);
        setExcelSuccessMsg(
          `Successfully parsed & committed ${res.total_records} records across ${res.total_chapters} chapters!`
        );
        setTimeout(() => {
          onImportSuccess();
          onClose();
        }, 1200);
      } catch (err: unknown) {
        const e = err as { message?: string };
        setErrorMsg(e?.message || "Failed to parse and import Excel workbook.");
      } finally {
        setIsImportingExcel(false);
      }
      return;
    }

    setIsPreviewing(true);
    try {
      const res = await previewCurriculumCSVImport(file);
      setPreview(res);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to parse CSV file preview.");
      setPreview(null);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleCommit = async () => {
    if (validRecords.length === 0) return;
    setIsCommitting(true);
    setErrorMsg(null);

    try {
      await commitCurriculumCSVImport(validRecords);
      onImportSuccess();
      onClose();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to import curriculum records.");
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import Curriculum CSV"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl rounded-lg bg-white border border-stone-200 shadow-xl p-5 sm:p-6 space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-red-50 text-[#B81104] border border-red-200 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Import Curriculum Spreadsheet</h3>
              <p className="text-[11px] text-stone-500">
                Upload Excel (.xlsx) or CSV standardized curriculum records
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Success notification */}
        {excelSuccessMsg && (
          <div className="p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{excelSuccessMsg}</span>
          </div>
        )}

        {/* Error notification */}
        {errorMsg && (
          <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Quick Sync Master Skeleton Banner */}
          {!preview && (
            <div className="p-3.5 rounded-md bg-stone-50 border border-stone-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Master Curriculum Skeleton (Grades 6–12)</span>
                </div>
                <p className="text-[11px] text-stone-500 font-medium">
                  Sync 865 topics, activities &amp; projects from Final Curriculum Skeleton.xlsx.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSyncSkeleton}
                disabled={isSyncingSkeleton || isImportingExcel}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-bold shrink-0 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSyncingSkeleton ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                    <span>Sync Master Skeleton</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Dropzone */}
          {!preview && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-[#B81104] bg-red-50/50 scale-[1.01]"
                  : "border-stone-300 hover:border-stone-400 bg-stone-50/50"
              }`}
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <div className="w-10 h-10 rounded-md bg-white border border-stone-200 text-stone-500 flex items-center justify-center mx-auto mb-2 shadow-2xs">
                {isImportingExcel || isPreviewing ? (
                  <Loader2 className="w-5 h-5 text-[#B81104] animate-spin" />
                ) : (
                  <UploadCloud className="w-5 h-5 text-[#B81104]" />
                )}
              </div>
              <p className="text-xs font-semibold text-stone-800">
                {isImportingExcel
                  ? "Importing Excel curriculum workbook..."
                  : isPreviewing
                  ? "Validating CSV records..."
                  : "Drop curriculum Excel (.xlsx) or CSV file here"}
              </p>
              <p className="text-[11px] text-stone-400 mt-0.5">or click to browse</p>
            </div>
          )}

          {/* Validation & Dry-Run Preview Results */}
          {preview && (
            <div className="space-y-3">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-md bg-stone-50 border border-stone-200 text-center">
                  <p className="text-[10px] font-medium text-stone-500">Total Rows</p>
                  <p className="text-base font-bold text-stone-900">{preview.total_rows}</p>
                </div>
                <div className="p-2.5 rounded-md bg-emerald-50/70 border border-emerald-200 text-center">
                  <p className="text-[10px] font-medium text-emerald-700">Valid</p>
                  <p className="text-base font-bold text-emerald-800">{preview.valid_count}</p>
                </div>
                <div className="p-2.5 rounded-md bg-stone-50 border border-stone-200 text-center">
                  <p className="text-[10px] font-medium text-stone-500">Errors</p>
                  <p
                    className={`text-base font-bold ${
                      preview.error_count > 0 ? "text-red-600" : "text-stone-400"
                    }`}
                  >
                    {preview.error_count}
                  </p>
                </div>
              </div>

              {/* Obsolete Columns Ignored Notice */}
              {allIgnoredColumns.length > 0 && (
                <div className="p-2.5 rounded-md bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-0.5">
                  <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                    <Info className="w-3.5 h-3.5 text-amber-600" />
                    <span>Excluded Unused Columns ({allIgnoredColumns.length}):</span>
                  </div>
                  <p className="text-[10px] text-amber-700 font-mono">
                    {allIgnoredColumns.join(", ")}
                  </p>
                </div>
              )}

              {/* Row Errors if any */}
              {allErrors.length > 0 && (
                <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-900 space-y-1 max-h-24 overflow-y-auto font-mono">
                  <p className="font-semibold text-[11px]">Validation Warnings:</p>
                  {allErrors.map((err: string, i: number) => (
                    <p key={i} className="text-[10px] text-red-700">
                      • {err}
                    </p>
                  ))}
                </div>
              )}

              {/* Uploaded Records Preview (First 5 records) */}
              <div className="border border-stone-200 rounded-md overflow-hidden">
                <div className="bg-stone-50 px-3 py-1.5 text-[10px] font-semibold text-stone-600 border-b border-stone-200">
                  Preview ({Math.min(5, validRecords.length)} of {validRecords.length})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-stone-50/50 text-stone-500 font-medium border-b border-stone-200">
                      <tr>
                        <th className="p-1.5">Count</th>
                        <th className="p-1.5">ID</th>
                        <th className="p-1.5">Grade</th>
                        <th className="p-1.5">Chapter</th>
                        <th className="p-1.5">Category</th>
                        <th className="p-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {validRecords.slice(0, 5).map((r: CurriculumRecordInput, i: number) => (
                        <tr key={i} className="hover:bg-stone-50">
                          <td className="p-1.5 font-mono">{r.count}</td>
                          <td className="p-1.5 font-mono font-medium">{r.video_id}</td>
                          <td className="p-1.5">Grade {r.grade}</td>
                          <td className="p-1.5 truncate max-w-[120px]">{r.chapter}</td>
                          <td className="p-1.5">{r.category}</td>
                          <td className="p-1.5 font-medium">{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between border-t border-stone-100">
          {preview ? (
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setSelectedFile(null);
              }}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-stone-600 hover:bg-stone-100 cursor-pointer transition-colors"
            >
              Change File
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isCommitting}
              className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={!preview || validRecords.length === 0 || isCommitting}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-semibold border border-[#8F0D03] shadow-xs disabled:opacity-50 transition-all cursor-pointer"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    Commit ({validRecords.length})
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

