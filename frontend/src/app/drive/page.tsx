"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/layout/AppHeader";
import {
  fetchDriveFiles,
  fetchDriveStatus,
  createDriveFolder,
  renameDriveFile,
  trashDriveFile,
  syncDriveChanges,
  DriveFileItem,
  DriveFileListResponse,
  DriveSyncStatusResponse,
  getDriveDownloadUrl,
  getDriveLoginUrl,
  disconnectDrive,
} from "../../lib/drive-api";
import { DrivePreviewModal } from "../../components/drive/DrivePreviewModal";
import { DriveShareModal } from "../../components/drive/DriveShareModal";
import { DriveUploadModal } from "../../components/drive/DriveUploadModal";
import { SelectDropdown } from "../../components/ui";
import {
  Folder,
  FileText,
  Eye,
  Download,
  Share2,
  Trash2,
  Edit2,
  UploadCloud,
  Search,
  RefreshCw,
  HardDrive,
  ChevronRight,
  LayoutGrid,
  List,
  Film,
  Volume2,
  FileSpreadsheet,
  Presentation,
  FileCode,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
  FolderPlus,
  AlertCircle,
  X,
} from "lucide-react";

const emptySubscribe = () => () => {};

export default function GoogleDriveWorkspacePage() {
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [fileData, setFileData] = useState<DriveFileListResponse | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveSyncStatusResponse | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("edinno_drive_status");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeMimeFilter, setActiveMimeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("date");

  // Modals state
  const [previewFile, setPreviewFile] = useState<DriveFileItem | null>(null);
  const [shareFile, setShareFile] = useState<DriveFileItem | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState<boolean>(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<DriveFileItem | null>(null);
  const [renameInput, setRenameInput] = useState<string>("");

  // Real-time synchronization state & cursor token
  const syncCursorRef = useRef<string | null>(null);
  const [, setLastSyncedTime] = useState<Date | null>(null);

  const refreshFiles = useCallback(async (folderId?: string | null, options?: { silent?: boolean }) => {
    try {
      const data = await fetchDriveFiles({ folder_id: folderId || undefined });
      setFileData((prev) => {
        if (!prev) return data;
        // Avoid DOM re-render churn if content is structurally identical
        if (
          prev.current_folder_id === data.current_folder_id &&
          prev.files.length === data.files.length &&
          prev.files.every(
            (f, i) =>
              f.id === data.files[i]?.id &&
              f.modified_time === data.files[i]?.modified_time &&
              f.name === data.files[i]?.name &&
              f.size_bytes === data.files[i]?.size_bytes
          )
        ) {
          return prev;
        }
        return data;
      });
      setLastSyncedTime(new Date());
    } catch (err: unknown) {
      if (!options?.silent) {
        const e = err as { message?: string };
        const rawMsg = e?.message || "";
        // Don't flash raw browser "Failed to fetch" if backend is temporarily reconnecting
        if (rawMsg.includes("Failed to fetch")) {
          console.debug("Drive server connection retry in progress...");
        } else {
          setErrorMsg(rawMsg || "Failed to load Google Drive files.");
        }
      } else {
        console.debug("Silent background refresh error:", err);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    let active = true;
    fetchDriveFiles({ folder_id: currentFolderId || undefined })
      .then((data) => {
        if (active) {
          setFileData(data);
          setIsLoading(false);
          setLastSyncedTime(new Date());
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const e = err as { message?: string };
          const rawMsg = e?.message || "";
          if (!rawMsg.includes("Failed to fetch")) {
            setErrorMsg(rawMsg || "Failed to load Google Drive files.");
          }
          setIsLoading(false);
        }
      });

    fetchDriveStatus()
      .then((s) => {
        if (active) {
          setDriveStatus(s);
          try {
            localStorage.setItem("edinno_drive_status", JSON.stringify(s));
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [currentFolderId]);

  // Real-time continuous change polling & focus revalidation
  useEffect(() => {
    let isCancelled = false;

    // 1. Initialize start page token cursor if not set
    const initCursor = async () => {
      try {
        const storedCursor = typeof window !== "undefined" ? sessionStorage.getItem("edinno_drive_cursor") : null;
        if (storedCursor) {
          syncCursorRef.current = storedCursor;
        } else {
          const res = await syncDriveChanges();
          if (!isCancelled && res.new_start_page_token) {
            syncCursorRef.current = res.new_start_page_token;
            try {
              sessionStorage.setItem("edinno_drive_cursor", res.new_start_page_token);
            } catch {}
          }
        }
      } catch (err) {
        console.debug("Could not initialize change token cursor:", err);
      }
    };

    initCursor();

    // 2. Incremental sync check function
    const performIncrementalSync = async (isManual = false) => {
      if (typeof document !== "undefined" && document.hidden && !isManual) return;
      try {
        const token = syncCursorRef.current || undefined;
        const res = await syncDriveChanges(token);
        if (isCancelled) return;

        if (res.new_start_page_token) {
          syncCursorRef.current = res.new_start_page_token;
          try {
            sessionStorage.setItem("edinno_drive_cursor", res.new_start_page_token);
          } catch {}
        }

        // If changes occurred in Google Drive, refresh the active directory view silently
        if (res.changes && res.changes.length > 0) {
          await refreshFiles(currentFolderId, { silent: true });
          fetchDriveStatus().then(setDriveStatus).catch(() => {});
          setLastSyncedTime(new Date());
        }
      } catch (err) {
        console.debug("Background incremental sync check:", err);
      }
    };

    // 3. Polling interval: every 6 seconds when tab is active
    const pollInterval = setInterval(() => {
      performIncrementalSync(false);
    }, 6000);

    // 4. Instant revalidation on window focus and tab visibility change
    const onFocusOrVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        performIncrementalSync(true);
      }
    };

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      isCancelled = true;
      clearInterval(pollInterval);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [currentFolderId, refreshFiles]);

  // Handle OAuth callback redirects (?connected=true or ?error=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isConnected = params.get("connected") === "true";
    const email = params.get("email");
    const err = params.get("error");

    if (!isConnected && !err) return;
    window.history.replaceState({}, document.title, window.location.pathname);

    const timer = setTimeout(() => {
      if (isConnected) {
        setSyncToast(
          email
            ? `Google Workspace authorized successfully for ${email}!`
            : "Google Drive Workspace authorized and connected successfully!"
        );
        fetchDriveStatus().then(setDriveStatus).catch(() => {});
        refreshFiles(currentFolderId);
      } else if (err) {
        setErrorMsg(`Google authorization error: ${err}`);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [currentFolderId, refreshFiles]);

  // Disconnect Workspace handler
  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect Google Drive Workspace?")) return;
    try {
      await disconnectDrive();
      try {
        localStorage.removeItem("edinno_drive_status");
        sessionStorage.removeItem("edinno_drive_cursor");
      } catch {}
      syncCursorRef.current = null;
      const status = await fetchDriveStatus();
      setDriveStatus(status);
      refreshFiles(null);
      setSyncToast("Google Drive Workspace disconnected. Reverted to local workspace mode.");
      setTimeout(() => setSyncToast(null), 3500);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to disconnect Google Drive.");
    }
  };

  // Bidirectional Synchronization Handler
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setErrorMsg(null);
    try {
      const token = syncCursorRef.current || undefined;
      const result = await syncDriveChanges(token);
      if (result.new_start_page_token) {
        syncCursorRef.current = result.new_start_page_token;
        try {
          sessionStorage.setItem("edinno_drive_cursor", result.new_start_page_token);
        } catch {}
      }
      setSyncToast(
        result.changes.length > 0
          ? `Synchronized ${result.changes.length} change(s) from Google Drive.`
          : "Workspace is up to date with Google Drive."
      );
      setTimeout(() => setSyncToast(null), 3500);
      await refreshFiles(currentFolderId);
      const status = await fetchDriveStatus();
      setDriveStatus(status);
      setLastSyncedTime(new Date());
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Bidirectional synchronization failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Create New Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newFolderName.trim();
    if (!cleanName || isCreatingFolder) return;

    // Check if folder already exists in the current view to avoid creating duplicate folders
    const existingFolder = fileData?.files.find(
      (f) => f.is_folder && f.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (existingFolder) {
      setIsNewFolderOpen(false);
      setNewFolderName("");
      setCurrentFolderId(existingFolder.id);
      return;
    }

    setIsCreatingFolder(true);
    try {
      await createDriveFolder(cleanName, currentFolderId || undefined);
      setNewFolderName("");
      setIsNewFolderOpen(false);
      refreshFiles(currentFolderId);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to create folder.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Rename File
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameInput.trim()) return;

    try {
      await renameDriveFile(renameTarget.id, renameInput.trim());
      setRenameTarget(null);
      setRenameInput("");
      refreshFiles(currentFolderId);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to rename file.");
    }
  };

  // Trash File
  const handleTrash = async (file: DriveFileItem) => {
    if (!confirm(`Are you sure you want to move "${file.name}" to Google Drive Trash?`)) return;

    try {
      await trashDriveFile(file.id);
      refreshFiles(currentFolderId);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to delete file.");
    }
  };

  // Filter and Sort Files
  const filteredAndSortedFiles = useMemo(() => {
    if (!fileData) return [];
    let items = [...fileData.files];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((f) => f.name.toLowerCase().includes(q));
    }

    // Smart deduplication: eliminate 0-byte ghost stubs and duplicate folders
    const dedupedMap = new Map<string, DriveFileItem>();
    for (const f of items) {
      const key = `${f.name.trim().toLowerCase()}::${f.is_folder ? "folder" : "file"}`;
      const existing = dedupedMap.get(key);
      if (!existing) {
        dedupedMap.set(key, f);
      } else {
        // If existing is 0-byte ghost and current is real file (>0 bytes), keep real file
        if (!f.is_folder && (existing.size_bytes || 0) === 0 && (f.size_bytes || 0) > 0) {
          dedupedMap.set(key, f);
        } else if (
          f.modified_time &&
          (!existing.modified_time || new Date(f.modified_time).getTime() > new Date(existing.modified_time).getTime())
        ) {
          // If both are valid, keep the one with latest modified time
          dedupedMap.set(key, f);
        }
      }
    }
    items = Array.from(dedupedMap.values());

    // MIME category filter
    if (activeMimeFilter !== "all") {
      items = items.filter((f) => {
        if (activeMimeFilter === "folder") return f.is_folder;
        if (activeMimeFilter === "pdf") return f.mime_type.includes("pdf");
        if (activeMimeFilter === "media")
          return (
            f.mime_type.startsWith("image/") ||
            f.mime_type.startsWith("video/") ||
            f.mime_type.startsWith("audio/")
          );
        if (activeMimeFilter === "docs")
          return (
            f.mime_type.includes("document") ||
            f.mime_type.includes("spreadsheet") ||
            f.mime_type.includes("presentation") ||
            f.mime_type.includes("officedocument")
          );
        return true;
      });
    }

    // Sort
    items.sort((a, b) => {
      // Folders always pinned to top
      if (a.is_folder && !b.is_folder) return -1;
      if (!a.is_folder && b.is_folder) return 1;

      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "size") {
        return (b.size_bytes || 0) - (a.size_bytes || 0);
      }
      // default "date" modified desc
      const dateA = a.modified_time ? new Date(a.modified_time).getTime() : 0;
      const dateB = b.modified_time ? new Date(b.modified_time).getTime() : 0;
      return dateB - dateA;
    });

    return items;
  }, [fileData, searchQuery, activeMimeFilter, sortBy]);

  // Helper icon selector
  const getFileIcon = (file: DriveFileItem) => {
    if (file.is_folder) return <Folder className="w-5 h-5 text-amber-500 fill-amber-100" />;
    const m = file.mime_type.toLowerCase();
    if (m.includes("pdf")) return <FileText className="w-5 h-5 text-red-600" />;
    if (m.startsWith("image/")) return <Eye className="w-5 h-5 text-blue-600" />;
    if (m.startsWith("video/")) return <Film className="w-5 h-5 text-purple-600" />;
    if (m.startsWith("audio/")) return <Volume2 className="w-5 h-5 text-amber-600" />;
    if (m.includes("spreadsheet") || m.includes("sheet"))
      return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    if (m.includes("presentation")) return <Presentation className="w-5 h-5 text-amber-600" />;
    if (m.includes("text/") || m.includes("json"))
      return <FileCode className="w-5 h-5 text-slate-700" />;
    return <FileText className="w-5 h-5 text-stone-500" />;
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <AppHeader activePage="drive" />
      <div className="max-w-[1720px] 2xl:max-w-[1840px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 space-y-6">
        {/* Top Navigation & Workspace Title */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-200">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link
                href="/studio"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-[#B81104] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Studio</span>
              </Link>
              <span className="text-stone-300">/</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#FFFACD] text-[#8F0D03] text-xs font-extrabold border border-[#F4E88C]">
                <Sparkles className="w-3 h-3 text-[#B81104]" />
                <span>CENTRALIZED PRO WORKSPACE</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-black text-[#1C1917] tracking-tight">
                Google Drive Cloud Workspace
              </h1>
              {!isMounted ? (
                <div className="h-6 w-36 rounded bg-stone-200/60 animate-pulse" />
              ) : driveStatus?.is_oauth_connected ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>OAuth Connected ({driveStatus.service_account_email || "Active"})</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-300">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>Live Sync Active</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="text-[11px] font-semibold text-stone-400 hover:text-red-600 hover:underline cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              ) : driveStatus?.is_configured ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold border border-blue-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Service Account Active</span>
                  </span>
                  <a
                    href={getDriveLoginUrl()}
                    className="text-[11px] font-bold text-[#B81104] hover:underline cursor-pointer"
                  >
                    Authorize Uploads →
                  </a>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>Local Mode (Offline)</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-stone-600 font-medium">
              Secure centralized file management, collaborative sharing, bidirectional synchronization, and universal in-app previews.
            </p>
          </div>

          {/* Action Hub */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Real-Time Sync Button */}
            <button
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-extrabold shadow-2xs transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#B81104] ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Reconciling..." : "Sync Drive"}</span>
            </button>

            {/* New Folder */}
            <button
              type="button"
              onClick={() => setIsNewFolderOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-extrabold shadow-2xs transition-all cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-600" />
              <span>New Folder</span>
            </button>

            {/* Upload Files */}
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-black shadow-md shadow-[#B81104]/20 transition-all cursor-pointer border border-[#8F0D03]"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Files</span>
            </button>
          </div>
        </div>

        {/* Sync Toast Notification */}
        {syncToast && (
          <div className="p-3.5 rounded bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2.5 shadow-2xs animate-in fade-in duration-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncToast}</span>
          </div>
        )}

        {/* Error notification */}
        {errorMsg && (
          <div className="p-4 rounded bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-red-700 font-bold hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Google Workspace Account Authorization Banner */}
        {isMounted && driveStatus && !driveStatus.is_oauth_connected && (
          <div className="p-4 sm:p-5 rounded-md bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                <h3 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                  Authorize Google Account for File Uploads
                </h3>
              </div>
              <p className="text-xs text-amber-900 font-medium max-w-2xl leading-relaxed">
                Your Service Account is connected for folder navigation. To upload files into your personal Google Drive, connect your Google account so uploads use your account&apos;s storage quota.
              </p>
            </div>
            <a
              href={getDriveLoginUrl()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-black shadow-md shadow-[#B81104]/20 transition-all cursor-pointer shrink-0 border border-[#8F0D03]"
            >
              <Sparkles className="w-4 h-4 text-[#FFFACD]" />
              <span>Authorize Google Account</span>
            </a>
          </div>
        )}

        {/* Breadcrumb Trail & Storage Telemetry Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-md bg-white border border-stone-200 shadow-xs">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700 overflow-x-auto">
            {fileData?.breadcrumbs.map((b, i) => {
              const isLast = i === fileData.breadcrumbs.length - 1;
              return (
                <React.Fragment key={b.id}>
                  {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />}
                  {isLast ? (
                    <span className="text-[#B81104] font-black truncate max-w-[200px]">{b.name}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCurrentFolderId(b.id === fileData.breadcrumbs[0].id ? null : b.id)}
                      className="hover:underline text-stone-600 hover:text-stone-900 truncate max-w-[150px] cursor-pointer"
                    >
                      {b.name}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Storage Quota Metric */}
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 shrink-0">
            <HardDrive className="w-4 h-4 text-[#B81104]" />
            <span>
              {!isMounted
                ? "Centralized Organization Storage"
                : driveStatus?.quota_readable || "Centralized Organization Storage"}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1" />
          </div>
        </div>

        {/* Search, Category Filter & View Mode Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative md:w-80">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search files or folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs font-medium pl-9 pr-3.5 py-2.5 rounded border border-stone-300 focus:outline-none focus:border-[#B81104] bg-white shadow-2xs"
            />
          </div>

          {/* MIME Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: "all", label: "All Items" },
              { id: "folder", label: "Folders" },
              { id: "pdf", label: "PDFs" },
              { id: "docs", label: "Documents" },
              { id: "media", label: "Media" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveMimeFilter(f.id)}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeMimeFilter === f.id
                    ? "bg-[#B81104] text-[#FFFACD] shadow-xs"
                    : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort & Grid/Table Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-52">
              <SelectDropdown
                size="xs"
                value={sortBy}
                onChange={(val) => setSortBy(val as "name" | "date" | "size")}
                options={[
                  { value: "date", label: "Sort by Date Modified" },
                  { value: "name", label: "Sort by Name" },
                  { value: "size", label: "Sort by Size" },
                ]}
              />
            </div>

            <div className="flex items-center bg-white border border-stone-300 rounded p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                title="Grid View"
                className={`p-1.5 rounded cursor-pointer ${
                  viewMode === "grid" ? "bg-stone-100 text-[#B81104]" : "text-stone-500 hover:text-stone-800"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                title="Table View"
                className={`p-1.5 rounded cursor-pointer ${
                  viewMode === "table" ? "bg-stone-100 text-[#B81104]" : "text-stone-500 hover:text-stone-800"
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Display: Loading / Empty / Grid / Table */}
        {isLoading ? (
          <div className="p-16 rounded-md bg-white border border-stone-200 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-[#B81104] animate-spin mx-auto" />
            <p className="text-xs font-bold text-stone-500">Loading Google Drive workspace contents...</p>
          </div>
        ) : filteredAndSortedFiles.length === 0 ? (
          <div className="p-16 rounded-md bg-white border-2 border-dashed border-stone-200 text-center space-y-4">
            <div className="w-14 h-14 rounded-md bg-stone-100 border border-stone-200 flex items-center justify-center mx-auto text-stone-400">
              <Folder className="w-7 h-7 text-stone-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-stone-900">This folder is empty</h3>
              <p className="text-xs text-stone-500 font-medium max-w-sm mx-auto">
                Upload PDFs, lab manuals, STEM projects, or create a folder to begin organizing your curriculum materials.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsUploadOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-black shadow-md cursor-pointer transition-all"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload First File</span>
            </button>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {filteredAndSortedFiles.map((file) => (
              <div
                key={file.id}
                className="group relative bg-white border border-stone-200/90 rounded-md p-4 shadow-2xs hover:shadow-md hover:border-[#B81104]/50 transition-all flex flex-col justify-between"
              >
                {/* File / Folder Card Header */}
                <div
                  onClick={() => (file.is_folder ? setCurrentFolderId(file.id) : setPreviewFile(file))}
                  className="cursor-pointer space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-10 h-10 rounded-md bg-stone-50 border border-stone-100 flex items-center justify-center shrink-0">
                      {getFileIcon(file)}
                    </div>
                    {file.shared && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                        SHARED
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-extrabold text-stone-900 truncate group-hover:text-[#B81104] transition-colors">
                      {file.name}
                    </h4>
                    <p className="text-[10px] text-stone-400 font-medium truncate mt-0.5">
                      {file.is_folder
                        ? "Folder"
                        : file.size_bytes
                        ? `${Math.round(file.size_bytes / 1024)} KB`
                        : "Document"}
                    </p>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="pt-3 mt-3 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-[10px] text-stone-400">
                    {file.modified_time
                      ? new Date(file.modified_time).toLocaleDateString()
                      : "Recently"}
                  </span>

                  <div className="flex items-center gap-1">
                    {!file.is_folder && (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          title="Quick In-App Preview"
                          className="p-1 rounded text-stone-500 hover:text-[#B81104] hover:bg-stone-100 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={getDriveDownloadUrl(file.id)}
                          download={file.name}
                          title="Download File"
                          className="p-1 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-100 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setShareFile(file)}
                      title="Share / Manage Permissions"
                      className="p-1 rounded text-stone-500 hover:text-blue-600 hover:bg-stone-100 cursor-pointer"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenameTarget(file);
                        setRenameInput(file.name);
                      }}
                      title="Rename"
                      className="p-1 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-100 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTrash(file)}
                      title="Delete"
                      className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Table View */
          <div className="rounded-md bg-white border border-stone-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider font-extrabold text-[10px]">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Owner / Workspace</th>
                    <th className="py-3 px-4">Last Modified</th>
                    <th className="py-3 px-4">File Size</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredAndSortedFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div
                          onClick={() =>
                            file.is_folder ? setCurrentFolderId(file.id) : setPreviewFile(file)
                          }
                          className="flex items-center gap-2.5 cursor-pointer"
                        >
                          <div className="shrink-0">{getFileIcon(file)}</div>
                          <span className="font-extrabold text-stone-900 hover:text-[#B81104] truncate max-w-sm">
                            {file.name}
                          </span>
                          {file.shared && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-50 text-blue-700">
                              SHARED
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-stone-500 font-medium">
                        {file.owners && file.owners[0]?.displayName
                          ? file.owners[0].displayName
                          : "Pro Workspace"}
                      </td>

                      <td className="py-3 px-4 text-stone-500 font-mono">
                        {file.modified_time
                          ? new Date(file.modified_time).toLocaleString()
                          : "—"}
                      </td>

                      <td className="py-3 px-4 text-stone-500 font-mono">
                        {file.is_folder
                          ? "—"
                          : file.size_bytes
                          ? `${Math.round(file.size_bytes / 1024)} KB`
                          : "Doc"}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {!file.is_folder && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPreviewFile(file)}
                                title="Preview"
                                className="p-1 rounded text-stone-500 hover:text-[#B81104] hover:bg-stone-100 cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <a
                                href={getDriveDownloadUrl(file.id)}
                                download={file.name}
                                title="Download"
                                className="p-1 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-100 cursor-pointer"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setShareFile(file)}
                            title="Share"
                            className="p-1 rounded text-stone-500 hover:text-blue-600 hover:bg-stone-100 cursor-pointer"
                          >
                            <Share2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenameTarget(file);
                              setRenameInput(file.name);
                            }}
                            title="Rename"
                            className="p-1 rounded text-stone-500 hover:text-stone-900 hover:bg-stone-100 cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTrash(file)}
                            title="Delete"
                            className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals & Dialogs */}
      <DrivePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <DriveShareModal file={shareFile} onClose={() => setShareFile(null)} />
      <DriveUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        currentFolderId={currentFolderId}
        currentFolderName={fileData?.current_folder_name}
        onUploadSuccess={() => refreshFiles(currentFolderId)}
      />

      {/* New Folder Modal */}
      {isNewFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-md bg-white border border-stone-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="text-base font-extrabold text-stone-900">Create New Folder</h3>
              <button
                type="button"
                onClick={() => setIsNewFolderOpen(false)}
                className="w-7 h-7 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase text-stone-700 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Grade 8 ESP32 Hardware Lab"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 rounded border border-stone-300 focus:outline-none focus:border-[#B81104]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewFolderOpen(false)}
                  className="px-4 py-2 rounded text-xs font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder || !newFolderName.trim()}
                  className="px-5 py-2 rounded bg-[#B81104] hover:bg-[#8F0D03] disabled:opacity-50 text-[#FFFACD] text-xs font-black shadow-md cursor-pointer inline-flex items-center gap-1.5"
                >
                  {isCreatingFolder ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Folder</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-md bg-white border border-stone-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="text-base font-extrabold text-stone-900">Rename Item</h3>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="w-7 h-7 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase text-stone-700 mb-1">
                  New Title / Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 rounded border border-stone-300 focus:outline-none focus:border-[#B81104]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-4 py-2 rounded text-xs font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-black shadow-md cursor-pointer"
                >
                  Save Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
