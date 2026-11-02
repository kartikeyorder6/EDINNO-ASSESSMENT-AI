"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  CurriculumRecord,
  CurriculumRecordCreate,
  CurriculumRecordUpdate,
  CurriculumStatus,
  CurriculumSummary,
  CurriculumHierarchyNode,
  fetchCurriculumRecords,
  fetchCurriculumHierarchy,
  fetchCurriculumSummary,
  createCurriculumRecord,
  updateCurriculumRecord,
  deleteCurriculumRecord,
  bulkUpdateCurriculumStatus,
  bulkDeleteCurriculumRecords,
  subscribeCurriculumEvents,
} from "../../../lib/curriculum-api";

export type ViewMode = "mindmap" | "table";

export interface CurriculumWorkspaceHook {
  // Data
  records: CurriculumRecord[];
  filteredRecords: CurriculumRecord[];
  hierarchyRoot: CurriculumHierarchyNode | null;
  summary: CurriculumSummary | null;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  setError: (err: string | null) => void;

  // View state
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  activeRecord: CurriculumRecord | null;
  setActiveRecord: (record: CurriculumRecord | null) => void;
  selectedIds: Set<string>;
  toggleSelectId: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Filters & Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedGrade: number | null;
  setSelectedGrade: (grade: number | null) => void;
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;
  selectedStatus: CurriculumStatus | null;
  setSelectedStatus: (status: CurriculumStatus | null) => void;
  clearFilters: () => void;

  // Sorting
  sortField: keyof CurriculumRecord;
  sortDirection: "asc" | "desc";
  setSorting: (field: keyof CurriculumRecord) => void;

  // CRUD Mutations
  createRecord: (payload: CurriculumRecordCreate) => Promise<CurriculumRecord | null>;
  updateRecord: (videoId: string, payload: CurriculumRecordUpdate) => Promise<CurriculumRecord | null>;
  deleteRecord: (videoId: string) => Promise<boolean>;
  bulkUpdateStatus: (status: CurriculumStatus) => Promise<boolean>;
  bulkDelete: () => Promise<boolean>;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
}

export function useCurriculumWorkspace(initialGrade?: number | null): CurriculumWorkspaceHook {
  const [records, setRecords] = useState<CurriculumRecord[]>([]);
  const [hierarchyRoot, setHierarchyRoot] = useState<CurriculumHierarchyNode | null>(null);
  const [summary, setSummary] = useState<CurriculumSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // View & Inspector
  const [viewMode, setViewMode] = useState<ViewMode>("mindmap");
  const [activeRecord, setActiveRecord] = useState<CurriculumRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<number | null>(initialGrade ?? null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<CurriculumStatus | null>(null);

  // Synchronize when activeGrade changes externally without cascading renders
  const [prevInitialGrade, setPrevInitialGrade] = useState(initialGrade);
  if (initialGrade !== undefined && initialGrade !== prevInitialGrade) {
    setPrevInitialGrade(initialGrade);
    setSelectedGrade(initialGrade);
  }

  // Sorting
  const [sortField, setSortField] = useState<keyof CurriculumRecord>("count");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Keep ref to latest records for optimistic rollbacks and SSE merging
  const recordsRef = useRef<CurriculumRecord[]>(records);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  // Primary data loader
  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setIsLoading(true);
      else setIsSyncing(true);

      try {
        const [recordsData, hierarchyData, summaryData] = await Promise.all([
          fetchCurriculumRecords({ page_size: 1500 }),
          fetchCurriculumHierarchy(),
          fetchCurriculumSummary(),
        ]);

        setRecords(recordsData.records);
        setHierarchyRoot(hierarchyData.root);
        setSummary(summaryData);
        setError(null);
      } catch (err: unknown) {
        const e = err as { message?: string };
        const rawMsg = e?.message || "";
        if (!rawMsg.includes("Failed to fetch")) {
          setError(rawMsg || "Failed to load curriculum records.");
        }
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) refresh();
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  // Real-time SSE subscription
  useEffect(() => {
    const unsubscribe = subscribeCurriculumEvents(
      (event) => {
        // When any change happens on the backend, silently refresh dataset
        refresh({ silent: true });

        // If the currently inspected record was updated or deleted
        const eventData =
          event.data && typeof event.data === "object"
            ? (event.data as Record<string, unknown>)
            : null;

        if (event.event === "RECORD_DELETED" && activeRecord?.video_id === eventData?.video_id) {
          setActiveRecord(null);
        } else if (
          event.event === "RECORD_UPDATED" &&
          eventData &&
          activeRecord?.video_id === eventData?.video_id &&
          "grade" in eventData
        ) {
          setActiveRecord(eventData as unknown as CurriculumRecord);
        }
      },
      (err) => {
        console.debug("SSE Curriculum events stream warning:", err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [refresh, activeRecord]);

  // Selection handlers
  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(records.map((r) => r.video_id)));
  }, [records]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedGrade(null);
    setSelectedCategory(null);
    setSelectedStatus(null);
  }, []);

  const setSorting = useCallback(
    (field: keyof CurriculumRecord) => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
    },
    [sortField]
  );

  // Optimistic Mutations
  const createRecord = useCallback(
    async (payload: CurriculumRecordCreate): Promise<CurriculumRecord | null> => {
      // Optimistic temp record
      const tempRecord: CurriculumRecord = {
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      };

      setRecords((prev) => [tempRecord, ...prev]);

      try {
        const saved = await createCurriculumRecord(payload);
        setRecords((prev) => prev.map((r) => (r.video_id === payload.video_id ? saved : r)));
        refresh({ silent: true });
        return saved;
      } catch (err: unknown) {
        // Rollback
        setRecords((prev) => prev.filter((r) => r.video_id !== payload.video_id));
        const e = err as { message?: string };
        setError(e?.message || "Failed to create curriculum record.");
        return null;
      }
    },
    [refresh]
  );

  const updateRecord = useCallback(
    async (videoId: string, payload: CurriculumRecordUpdate): Promise<CurriculumRecord | null> => {
      const previous = recordsRef.current.find((r) => r.video_id === videoId);
      if (!previous) return null;

      // Optimistic update
      const optimisticUpdated: CurriculumRecord = {
        ...previous,
        ...payload,
        updated_at: new Date().toISOString(),
        version: previous.version + 1,
      };

      setRecords((prev) => prev.map((r) => (r.video_id === videoId ? optimisticUpdated : r)));
      if (activeRecord?.video_id === videoId) {
        setActiveRecord(optimisticUpdated);
      }

      try {
        const saved = await updateCurriculumRecord(videoId, {
          ...payload,
          expected_version: previous.version, // optimistic concurrency check
        });
        setRecords((prev) => prev.map((r) => (r.video_id === videoId ? saved : r)));
        if (activeRecord?.video_id === videoId) {
          setActiveRecord(saved);
        }
        refresh({ silent: true });
        return saved;
      } catch (err: unknown) {
        // Rollback on conflict or failure
        setRecords((prev) => prev.map((r) => (r.video_id === videoId ? previous : r)));
        if (activeRecord?.video_id === videoId) {
          setActiveRecord(previous);
        }
        const e = err as { message?: string };
        setError(e?.message || "Failed to update record. Another user may have modified it.");
        return null;
      }
    },
    [activeRecord, refresh]
  );

  const deleteRecord = useCallback(
    async (videoId: string): Promise<boolean> => {
      const previous = recordsRef.current;
      const target = previous.find((r) => r.video_id === videoId);
      if (!target) return false;

      // Optimistic deletion
      setRecords((prev) => prev.filter((r) => r.video_id !== videoId));
      if (activeRecord?.video_id === videoId) setActiveRecord(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });

      try {
        await deleteCurriculumRecord(videoId);
        refresh({ silent: true });
        return true;
      } catch (err: unknown) {
        // Rollback
        setRecords(previous);
        const e = err as { message?: string };
        setError(e?.message || "Failed to delete record.");
        return false;
      }
    },
    [activeRecord, refresh]
  );

  const bulkUpdateStatus = useCallback(
    async (status: CurriculumStatus): Promise<boolean> => {
      if (selectedIds.size === 0) return false;
      const idsArray = Array.from(selectedIds);
      const previous = recordsRef.current;

      // Optimistic bulk status update
      setRecords((prev) =>
        prev.map((r) => (selectedIds.has(r.video_id) ? { ...r, status, updated_at: new Date().toISOString() } : r))
      );

      try {
        await bulkUpdateCurriculumStatus(idsArray, status);
        clearSelection();
        refresh({ silent: true });
        return true;
      } catch (err: unknown) {
        // Rollback
        setRecords(previous);
        const e = err as { message?: string };
        setError(e?.message || "Failed to bulk update status.");
        return false;
      }
    },
    [selectedIds, clearSelection, refresh]
  );

  const bulkDelete = useCallback(async (): Promise<boolean> => {
    if (selectedIds.size === 0) return false;
    const idsArray = Array.from(selectedIds);
    const previous = recordsRef.current;

    // Optimistic bulk deletion
    setRecords((prev) => prev.filter((r) => !selectedIds.has(r.video_id)));
    if (activeRecord && selectedIds.has(activeRecord.video_id)) {
      setActiveRecord(null);
    }
    clearSelection();

    try {
      await bulkDeleteCurriculumRecords(idsArray);
      refresh({ silent: true });
      return true;
    } catch (err: unknown) {
      // Rollback
      setRecords(previous);
      const e = err as { message?: string };
      setError(e?.message || "Failed to delete selected records.");
      return false;
    }
  }, [selectedIds, activeRecord, clearSelection, refresh]);

  // Filtered & Sorted Records
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.video_id.toLowerCase().includes(q) ||
          r.chapter.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          String(r.grade).includes(q) ||
          String(r.count).includes(q)
      );
    }

    // Grade filter
    if (selectedGrade !== null) {
      result = result.filter((r) => r.grade === selectedGrade);
    }

    // Category filter
    if (selectedCategory !== null) {
      result = result.filter((r) => r.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    // Status filter
    if (selectedStatus !== null) {
      result = result.filter((r) => r.status === selectedStatus);
    }

    // Sorting
    result.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      let comp = 0;
      if (typeof valA === "number" && typeof valB === "number") {
        comp = valA - valB;
      } else {
        comp = String(valA ?? "").localeCompare(String(valB ?? ""), undefined, { numeric: true });
      }

      return sortDirection === "asc" ? comp : -comp;
    });

    return result;
  }, [records, searchQuery, selectedGrade, selectedCategory, selectedStatus, sortField, sortDirection]);

  return {
    records,
    filteredRecords,
    hierarchyRoot,
    summary,
    isLoading,
    isSyncing,
    error,
    setError,
    viewMode,
    setViewMode,
    activeRecord,
    setActiveRecord,
    selectedIds,
    toggleSelectId,
    selectAll,
    clearSelection,
    searchQuery,
    setSearchQuery,
    selectedGrade,
    setSelectedGrade,
    selectedCategory,
    setSelectedCategory,
    selectedStatus,
    setSelectedStatus,
    clearFilters,
    sortField,
    sortDirection,
    setSorting,
    createRecord,
    updateRecord,
    deleteRecord,
    bulkUpdateStatus,
    bulkDelete,
    refresh,
  };
}

