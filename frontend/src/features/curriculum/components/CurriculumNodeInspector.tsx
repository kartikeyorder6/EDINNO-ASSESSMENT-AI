"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  CurriculumRecord,
  CurriculumRecordUpdate,
  CurriculumStatus,
  CURRICULUM_STATUSES,
} from "../../../lib/curriculum-api";
import { CloudinaryAsset } from "../../../types";
import { fetchCloudinaryAssets } from "../../../lib/cloudinary-api";
import {
  X,
  Save,
  Trash2,
  ShieldAlert,
  Copy,
  Check,
  FileText,
  Cloud,
  Sparkles,
  ExternalLink,
  Eye,
  Upload,
  Loader2,
  Minus,
  Plus,
} from "lucide-react";
import { SelectDropdown, CurriculumStatusBadge } from "../../../components/ui";

interface CurriculumNodeInspectorProps {
  record: CurriculumRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (videoId: string, update: CurriculumRecordUpdate) => Promise<CurriculumRecord | null>;
  onDelete: (videoId: string) => Promise<boolean>;
  onOpenPdfStorage?: (grade?: number, chapter?: string) => void;
  onAssessRecord?: (record: CurriculumRecord, asset?: CloudinaryAsset) => void;
}

export function CurriculumNodeInspector({
  record,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onOpenPdfStorage,
  onAssessRecord,
}: CurriculumNodeInspectorProps) {
  const [formData, setFormData] = useState<CurriculumRecordUpdate>({
    count: record?.count ?? 1,
    grade: record?.grade ?? 6,
    chapter: record?.chapter ?? "",
    category: record?.category ?? "Topic",
    status: record?.status ?? "Not Started",
  });
  const [countInput, setCountInput] = useState<string>(String(record?.count ?? 1));

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Cloudinary PDF Attachment state
  const [attachedPdfs, setAttachedPdfs] = useState<CloudinaryAsset[]>([]);
  const [isLoadingPdfs, setIsLoadingPdfs] = useState<boolean>(false);
  const [previewPdf, setPreviewPdf] = useState<CloudinaryAsset | null>(null);

  // Sync form state when active record changes without cascading render warnings
  const [prevRecordId, setPrevRecordId] = useState<string | null>(record?.video_id ?? null);
  if (record && record.video_id !== prevRecordId) {
    setPrevRecordId(record.video_id);
    setCountInput(String(record.count));
    setFormData({
      count: record.count,
      grade: record.grade,
      chapter: record.chapter,
      category: record.category,
      status: record.status,
    });
    setStatusMsg(null);
    setCopiedId(false);
  } else if (!record && prevRecordId !== null) {
    setPrevRecordId(null);
    setAttachedPdfs([]);
  }

  useEffect(() => {
    if (!record) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) setIsLoadingPdfs(true);
    });
    fetchCloudinaryAssets({
      grade: record.grade,
      search: record.chapter,
      pageSize: 5,
    })
      .then((resp) => {
        if (active) setAttachedPdfs(resp.items);
      })
      .catch(() => {
        if (active) setAttachedPdfs([]);
      })
      .finally(() => {
        if (active) setIsLoadingPdfs(false);
      });
    return () => {
      active = false;
    };
  }, [record]);

  // Track dirty changes
  const isDirty = useMemo(() => {
    if (!record) return false;
    return (
      formData.count !== record.count ||
      formData.grade !== record.grade ||
      formData.chapter !== record.chapter ||
      formData.category !== record.category ||
      formData.status !== record.status
    );
  }, [formData, record]);

  // Copy Video ID to clipboard
  const handleCopyId = useCallback(async () => {
    if (!record?.video_id) return;
    try {
      await navigator.clipboard.writeText(record.video_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Fallback
    }
  }, [record]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!record) return;
      setIsSaving(true);
      setStatusMsg(null);

      try {
        const parsedCount = parseInt(countInput, 10);
        const finalCount = !isNaN(parsedCount) && parsedCount >= 1 ? parsedCount : formData.count || 1;
        const res = await onSave(record.video_id, { ...formData, count: finalCount });
        if (res) {
          setStatusMsg({ text: "Record updated successfully!", type: "success" });
          setTimeout(() => setStatusMsg(null), 2500);
        } else {
          setStatusMsg({ text: "Failed to update record.", type: "error" });
        }
      } finally {
        setIsSaving(false);
      }
    },
    [countInput, formData, onSave, record]
  );

  // Escape key to dismiss & Cmd/Ctrl+S to save
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !isSaving) {
          handleSubmit();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDirty, isSaving, onClose, handleSubmit]);

  if (!isOpen || !record) return null;

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete curriculum record "${record.video_id}"?`)) return;
    setIsDeleting(true);
    try {
      const ok = await onDelete(record.video_id);
      if (ok) {
        onClose();
      } else {
        setStatusMsg({ text: "Failed to delete record.", type: "error" });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Subtle backdrop overlay for outside dismissal */}
      <div
        className="fixed inset-0 bg-stone-900/30 backdrop-blur-2xs z-40 transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Curriculum Record Details: ${record.video_id}`}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l border-stone-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-100 bg-stone-50/70">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-stone-900 font-mono tracking-tight">
                {record.video_id}
              </h2>
              <button
                type="button"
                onClick={handleCopyId}
                title="Copy Video ID"
                className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
              >
                {copiedId ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <CurriculumStatusBadge status={formData.status as CurriculumStatus} size="sm" />
              {isDirty && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                  Unsaved
                </span>
              )}
            </div>
            <p className="text-xs text-stone-400 mt-0.5">
              Sequence #{record.count} • 6-Field Standard Model • Press{" "}
              <kbd className="px-1 py-0.2 rounded bg-stone-200 text-stone-700 font-mono text-[10px]">
                Esc
              </kbd>{" "}
              to exit
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Inspector"
            className="w-8 h-8 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {statusMsg && (
            <div
              className={`p-3 rounded text-xs flex items-center gap-2 ${
                statusMsg.type === "success"
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* 1. Count */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-700">Sr. No. / Sequence (#)</label>
              <span className="text-[10px] text-stone-400">Order in curriculum</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const cur = parseInt(countInput, 10) || 1;
                  if (cur > 1) {
                    const next = String(cur - 1);
                    setCountInput(next);
                    setFormData((prev) => ({ ...prev, count: cur - 1 }));
                  }
                }}
                className="w-8 h-8 rounded border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold flex items-center justify-center cursor-pointer transition-colors"
                title="Decrease sequence number"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={countInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setCountInput(val);
                  if (val) {
                    const num = parseInt(val, 10);
                    if (num >= 1) {
                      setFormData((prev) => ({ ...prev, count: num }));
                    }
                  }
                }}
                onBlur={() => {
                  if (!countInput || parseInt(countInput, 10) < 1) {
                    setCountInput("1");
                    setFormData((prev) => ({ ...prev, count: 1 }));
                  }
                }}
                placeholder="e.g. 1"
                className="flex-1 px-3 py-1.5 rounded border border-stone-300 font-mono font-bold text-stone-800 text-center text-xs focus:outline-hidden focus:border-[#B81104] focus:ring-1 focus:ring-[#B81104]"
                required
              />
              <button
                type="button"
                onClick={() => {
                  const cur = parseInt(countInput, 10) || 0;
                  const next = String(cur + 1);
                  setCountInput(next);
                  setFormData((prev) => ({ ...prev, count: cur + 1 }));
                }}
                className="w-8 h-8 rounded border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold flex items-center justify-center cursor-pointer transition-colors"
                title="Increase sequence number"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 2. Video ID (Read-only identifier) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-700">Video ID (Unique Identifier)</label>
              <span className="text-[10px] text-stone-400 font-mono">Immutable</span>
            </div>
            <input
              type="text"
              value={record.video_id}
              disabled
              className="w-full px-3 py-2 rounded border border-stone-200 bg-stone-100 text-xs font-mono text-stone-500 cursor-not-allowed select-all"
            />
          </div>

          {/* 3. Grade */}
          <SelectDropdown
            label="Grade"
            value={String(formData.grade)}
            onChange={(val) => setFormData({ ...formData, grade: parseInt(val, 10) || 6 })}
            options={[6, 7, 8, 9, 10, 11, 12].map((g) => ({
              value: String(g),
              label: `Grade ${g}`,
            }))}
            size="sm"
          />

          {/* 4. Chapter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Chapter</label>
            <input
              type="text"
              value={formData.chapter}
              onChange={(e) => setFormData({ ...formData, chapter: e.target.value })}
              className="w-full px-3 py-2 rounded border border-stone-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#B81104]/20 focus:border-[#B81104]"
              placeholder="Enter chapter name..."
              required
            />
          </div>

          {/* 5. Category */}
          <div>
            <SelectDropdown
              label="Category / Type"
              value={formData.category || "Topic"}
              onChange={(val) => setFormData((prev) => ({ ...prev, category: val }))}
              options={[
                { value: "Topic", label: "Topic" },
                { value: "Activity", label: "Activity" },
                { value: "Project", label: "Project" },
              ]}
              size="sm"
            />
          </div>

          {/* 6. Status (Workflow State) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-700">Workflow Status</label>
            <div className="grid grid-cols-2 gap-2">
              {CURRICULUM_STATUSES.map((st) => (
                <button
                  type="button"
                  key={st}
                  onClick={() => setFormData({ ...formData, status: st })}
                  className={`flex items-center justify-between p-2 rounded border text-xs font-bold cursor-pointer transition-all ${
                    formData.status === st
                      ? "border-[#B81104] bg-red-50/50 text-[#8F0D03] ring-1 ring-[#B81104]"
                      : "border-stone-200 hover:bg-stone-50 text-stone-600"
                  }`}
                >
                  <CurriculumStatusBadge status={st} size="sm" />
                  {formData.status === st && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B81104]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Cloudinary PDF Materials Section */}
          <div className="space-y-2 pt-3 border-t border-stone-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                <Cloud className="w-3.5 h-3.5 text-[#B81104]" />
                <span>Chapter PDF Materials (Cloudinary)</span>
              </div>
              {onOpenPdfStorage && (
                <button
                  type="button"
                  onClick={() => onOpenPdfStorage(record.grade, record.chapter)}
                  className="text-[11px] font-bold text-[#B81104] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload / Manage</span>
                </button>
              )}
            </div>

            {isLoadingPdfs ? (
              <div className="p-3 bg-stone-50 rounded border border-stone-200 text-center flex items-center justify-center gap-2 text-stone-500 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B81104]" />
                <span>Querying Cloudinary assets...</span>
              </div>
            ) : attachedPdfs.length > 0 ? (
              <div className="space-y-1.5">
                {attachedPdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="p-2.5 rounded bg-stone-50 hover:bg-stone-100 border border-stone-200 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-[#B81104] shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-bold text-stone-900 truncate" title={pdf.title}>
                          {pdf.title}
                        </div>
                        <div className="text-[10px] text-stone-500">
                          {pdf.category} &bull; {pdf.metadata?.page_count || 1} pages &bull; v{pdf.version}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewPdf(pdf)}
                        title="Preview PDF Document"
                        className="p-1 rounded hover:bg-white text-stone-600 cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={pdf.secure_url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open in Cloudinary CDN"
                        className="p-1 rounded hover:bg-white text-stone-600 shadow-2xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {onAssessRecord && (
                        <button
                          type="button"
                          onClick={() => onAssessRecord(record, pdf)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#B81104] hover:bg-[#8F0D03] text-white text-[10px] font-bold cursor-pointer shadow-2xs"
                        >
                          <Sparkles className="w-3 h-3 text-amber-200" />
                          <span>Assess</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-stone-50/70 rounded border border-dashed border-stone-200 text-center space-y-1">
                <p className="text-[11px] text-stone-500">No PDF attached to this chapter yet.</p>
                {onOpenPdfStorage && (
                  <button
                    type="button"
                    onClick={() => onOpenPdfStorage(record.grade, record.chapter)}
                    className="text-[11px] font-bold text-[#B81104] hover:underline cursor-pointer"
                  >
                    Attach Chapter PDF from Cloudinary Storage
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Metadata info */}
          <div className="pt-4 border-t border-stone-100 text-[11px] text-stone-400 space-y-1">
            <p>Created: {new Date(record.created_at).toLocaleString()}</p>
            <p>Last Modified: {new Date(record.updated_at).toLocaleString()}</p>
          </div>

          {/* Footer Actions */}
          <div className="pt-5 flex items-center justify-between gap-3 border-t border-stone-100">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? "Deleting..." : "Delete"}</span>
            </button>

            <div className="flex items-center gap-2">
              {onAssessRecord && (
                <button
                  type="button"
                  onClick={() => onAssessRecord(record, attachedPdfs[0])}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-bold bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                  title="Load chapter into AI Assessment Studio"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Assess Chapter</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded text-xs font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !isDirty}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-black shadow-md transition-all cursor-pointer ${
                  !isDirty
                    ? "bg-stone-200 text-stone-500 cursor-not-allowed shadow-none"
                    : "bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] shadow-[#B81104]/20"
                }`}
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? "Saving..." : isDirty ? "Save Changes" : "Saved"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Embedded PDF Reader Modal */}
      {previewPdf && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-xs">
          <div className="relative w-full max-w-4xl h-[80vh] flex flex-col rounded-md bg-white border border-stone-200 shadow-2xl overflow-hidden">
            <div className="p-3 bg-stone-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="font-bold text-xs truncate">{previewPdf.title}</span>
                <span className="text-[10px] text-stone-400">
                  (Grade {previewPdf.grade} &bull; {previewPdf.category})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPdf(null)}
                className="w-6 h-6 rounded hover:bg-stone-800 text-stone-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 bg-stone-100 w-full h-full relative">
              <iframe
                src={`${previewPdf.secure_url}#toolbar=1`}
                title={previewPdf.title}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

