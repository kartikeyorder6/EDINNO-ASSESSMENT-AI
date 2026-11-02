"use client";

import React, { useState, useEffect } from "react";
import { DriveFileItem, getDriveDownloadUrl } from "../../lib/drive-api";
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  FileText,
  FileCode,
  Eye,
  FileSpreadsheet,
  Presentation,
  Volume2,
  Film,
  RotateCw,
} from "lucide-react";

interface DrivePreviewModalProps {
  file: DriveFileItem | null;
  onClose: () => void;
}

export function DrivePreviewModal({ file, onClose }: DrivePreviewModalProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState<boolean>(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [prevFileId, setPrevFileId] = useState<string | null>(file?.id || null);

  // Synchronize state when switching files without cascading effects
  if (file && file.id !== prevFileId) {
    setPrevFileId(file.id);
    setZoomLevel(100);
    setTextContent(null);
    setTextError(null);
  }

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!file) return null;

  const downloadUrl = getDriveDownloadUrl(file.id);
  const mime = file.mime_type.toLowerCase();

  const isPdf = mime.includes("pdf");
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");
  const isGoogleDoc = mime.includes("google-apps.document") || mime.includes("wordprocessingml");
  const isGoogleSheet = mime.includes("google-apps.spreadsheet") || mime.includes("spreadsheetml");
  const isGoogleSlide = mime.includes("google-apps.presentation") || mime.includes("presentationml");
  const isOfficeOrDoc = isGoogleDoc || isGoogleSheet || isGoogleSlide;
  const isTextOrCode =
    mime.includes("text/") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("python") ||
    mime.includes("xml") ||
    file.name.endsWith(".txt") ||
    file.name.endsWith(".json") ||
    file.name.endsWith(".py") ||
    file.name.endsWith(".md");

  // Fetch text content if plain text/code
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isTextOrCode || isPdf || isImage || isVideo || isAudio) return;

    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted) setIsLoadingText(true);
    }, 0);

    fetch(downloadUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load file preview stream.");
        return res.text();
      })
      .then((txt) => {
        if (mounted) {
          setTextContent(txt);
          setIsLoadingText(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setTextError(err.message || "Failed to load preview text.");
          setIsLoadingText(false);
        }
      });

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [file.id, downloadUrl, isTextOrCode, isPdf, isImage, isVideo, isAudio]);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 25, 250));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 25, 50));
  const handleResetZoom = () => setZoomLevel(100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${file.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-stone-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-6xl h-[88vh] rounded-lg bg-white border border-stone-200 shadow-xl flex flex-col overflow-hidden">
        {/* Top Control Bar */}
        <div className="h-14 px-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-white border border-stone-200 text-[#B81104] flex items-center justify-center shadow-2xs shrink-0">
              {isPdf && <FileText className="w-4 h-4 text-red-600" />}
              {isImage && <Eye className="w-4 h-4 text-blue-600" />}
              {isVideo && <Film className="w-4 h-4 text-purple-600" />}
              {isAudio && <Volume2 className="w-4 h-4 text-amber-600" />}
              {isGoogleDoc && <FileText className="w-4 h-4 text-blue-600" />}
              {isGoogleSheet && <FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
              {isGoogleSlide && <Presentation className="w-4 h-4 text-amber-600" />}
              {isTextOrCode && <FileCode className="w-4 h-4 text-slate-700" />}
              {!isPdf && !isImage && !isVideo && !isAudio && !isOfficeOrDoc && !isTextOrCode && (
                <FileText className="w-4 h-4 text-stone-600" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-stone-900 truncate">{file.name}</h3>
              <p className="text-[10px] text-stone-500 font-medium">
                {file.size_bytes ? `${Math.round(file.size_bytes / 1024)} KB` : "Document"} &bull; {file.mime_type}
              </p>
            </div>
          </div>

          {/* Action Tools */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Zoom Controls (Images / PDFs) */}
            {(isImage || isPdf) && (
              <div className="hidden sm:flex items-center bg-white border border-stone-200 rounded-md p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  className="p-1 rounded hover:bg-stone-100 text-stone-600 cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 text-xs font-bold text-stone-700 tabular-nums">
                  {zoomLevel}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  className="p-1 rounded hover:bg-stone-100 text-stone-600 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Reset Zoom"
                  className="p-1 rounded hover:bg-stone-100 text-stone-600 cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Direct Google Drive Link */}
            {file.web_view_link && (
              <a
                href={file.web_view_link}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in Google Drive"
                className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Drive</span>
              </a>
            )}

            {/* Download File */}
            <a
              href={downloadUrl}
              download={file.name}
              title="Download file"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-bold transition-all shadow-xs cursor-pointer border border-[#8F0D03]"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              title="Close Preview (Escape)"
              className="w-7 h-7 rounded-md bg-stone-200 hover:bg-stone-300 text-stone-700 flex items-center justify-center cursor-pointer transition-colors ml-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Preview Canvas Body */}
        <div className="flex-1 overflow-auto bg-stone-100 flex items-center justify-center p-4 relative">
          {/* 1. PDF Documents */}
          {isPdf && (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <iframe
                src={`https://drive.google.com/file/d/${file.id}/preview`}
                title={file.name}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="w-full h-full rounded-md border border-stone-300 shadow-sm bg-white"
                style={{
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: "top center",
                }}
              />
            </div>
          )}

          {/* 2. Images */}
          {isImage && (
            <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={downloadUrl}
                alt={file.name}
                style={{
                  transform: `scale(${zoomLevel / 100})`,
                  transition: "transform 0.15s ease-out",
                }}
                className="max-h-full max-w-full object-contain rounded-md shadow-md border border-stone-200 bg-white"
              />
            </div>
          )}

          {/* 3. HTML5 Video Player */}
          {isVideo && (
            <div className="w-full max-w-4xl max-h-full flex items-center justify-center">
              <video
                controls
                autoPlay
                className="w-full rounded-md shadow-lg border border-stone-800 bg-black max-h-[75vh]"
              >
                <source src={downloadUrl} type={file.mime_type} />
                Your browser does not support HTML5 video preview.
              </video>
            </div>
          )}

          {/* 4. HTML5 Audio Player */}
          {isAudio && (
            <div className="w-full max-w-md p-6 rounded-lg bg-white border border-stone-200 shadow-md text-center space-y-3">
              <div className="w-12 h-12 rounded-md bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-2xs">
                <Volume2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900">{file.name}</h4>
                <p className="text-[11px] text-stone-500 font-medium">{file.mime_type}</p>
              </div>
              <audio controls className="w-full pt-1">
                <source src={downloadUrl} type={file.mime_type} />
                Your browser does not support HTML5 audio playback.
              </audio>
            </div>
          )}

          {/* 5. Google Docs / Sheets / Slides / Office Embed */}
          {isOfficeOrDoc && !isPdf && (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <iframe
                src={`https://drive.google.com/file/d/${file.id}/preview`}
                title={file.name}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="w-full h-full rounded-md border border-stone-300 shadow-sm bg-white"
                allow="autoplay"
              />
            </div>
          )}

          {/* 6. Text / Source Code Viewer */}
          {isTextOrCode && !isPdf && !isOfficeOrDoc && (
            <div className="w-full h-full flex flex-col bg-white rounded-md border border-stone-300 shadow-sm overflow-hidden">
              <div className="p-2.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between text-xs text-stone-600">
                <span className="font-mono font-bold">{file.name}</span>
                {textContent && (
                  <span>
                    {textContent.split("\n").length} lines &bull; {textContent.length} chars
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-stone-800 bg-stone-50/50">
                {isLoadingText ? (
                  <div className="text-center py-12 text-stone-400 font-sans">
                    Loading file contents...
                  </div>
                ) : textError ? (
                  <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 font-sans">
                    {textError}
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-all">{textContent}</pre>
                )}
              </div>
            </div>
          )}

          {/* 7. Unsupported / Generic Binary Fallback */}
          {!isPdf && !isImage && !isVideo && !isAudio && !isOfficeOrDoc && !isTextOrCode && (
            <div className="max-w-sm p-6 rounded-lg bg-white border border-stone-200 shadow-md text-center space-y-3">
              <div className="w-12 h-12 rounded-md bg-stone-100 border border-stone-200 text-stone-600 flex items-center justify-center mx-auto shadow-2xs">
                <FileText className="w-6 h-6 text-[#B81104]" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-stone-900">{file.name}</h4>
                <p className="text-xs text-stone-500">
                  Preview not available for {file.mime_type}.
                </p>
              </div>
              <a
                href={downloadUrl}
                download={file.name}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-bold shadow-xs border border-[#8F0D03] transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
