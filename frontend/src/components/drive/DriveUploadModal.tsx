"use client";

import React, { useState, useRef, useEffect } from "react";
import { uploadDriveFile, DriveFileItem } from "../../lib/drive-api";
import { UploadCloud, X, AlertCircle, Loader2, FileText } from "lucide-react";

interface DriveUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFolderId?: string | null;
  currentFolderName?: string | null;
  onUploadSuccess: (item: DriveFileItem) => void;
}

export function DriveUploadModal({
  isOpen,
  onClose,
  currentFolderId,
  currentFolderName,
  onUploadSuccess,
}: DriveUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
      setErrorMsg(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
      setErrorMsg(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setErrorMsg(null);
    setUploadProgress(10);

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const uploaded = await uploadDriveFile(
          file,
          currentFolderId || undefined,
          `Uploaded to ${currentFolderName || "Workspace Root"}`
        );
        onUploadSuccess(uploaded);
        setUploadProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
      }
      setTimeout(() => {
        setIsUploading(false);
        setSelectedFiles([]);
        setUploadProgress(0);
        onClose();
      }, 500);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to upload file(s) to Google Drive.");
      setIsUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload files to Google Drive"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-lg bg-white border border-stone-200 shadow-xl p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-red-50 text-[#B81104] border border-red-200 flex items-center justify-center shrink-0">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900">Upload to Drive</h3>
              <p className="text-[11px] text-stone-500 truncate">
                Folder: {currentFolderName || "Workspace Root"}
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

        {/* Error notification */}
        {errorMsg && (
          <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Drag & Drop Zone */}
        <form onSubmit={handleSubmit} className="space-y-3">
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
              multiple
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-10 h-10 rounded-md bg-white border border-stone-200 text-stone-500 flex items-center justify-center mx-auto mb-2 shadow-2xs">
              <UploadCloud className="w-5 h-5 text-[#B81104]" />
            </div>
            <p className="text-xs font-semibold text-stone-800">
              Drop files here or click to browse
            </p>
            <p className="text-[11px] text-stone-400 mt-0.5">Supports PDF, docs, media</p>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-stone-200 p-2 bg-stone-50/70">
              {selectedFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-stone-700 py-0.5">
                  <div className="flex items-center gap-1.5 truncate">
                    <FileText className="w-3.5 h-3.5 text-[#B81104] shrink-0" />
                    <span className="truncate font-medium">{f.name}</span>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono shrink-0 ml-2">
                    {Math.round(f.size / 1024)} KB
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-xs font-medium text-stone-700">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-sm bg-stone-200 overflow-hidden">
                <div
                  className="h-full bg-[#B81104] transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || selectedFiles.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-semibold border border-[#8F0D03] shadow-xs disabled:opacity-50 transition-all cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ""}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
