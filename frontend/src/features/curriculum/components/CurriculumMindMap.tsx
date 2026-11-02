"use client";

import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  CurriculumRecord,
  CurriculumStatus,
  CurriculumHierarchyNode,
} from "../../../lib/curriculum-api";
import {
  Checkbox,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  CurriculumStatusBadge,
} from "../../../components/ui";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronDown,
  Layers,
  Folder,
  FileText,
  Plus,
  Trash2,
  Compass,
  SlidersHorizontal,
  Download,
  Search,
  Copy,
  Check,
  BookOpen,
  Zap,
  Award,
  Palette,
  Focus,
  Crosshair,
  Cloud,
  FileImage,
  FileCode,
  RotateCcw,
  Sparkles,
  X,
  GripVertical,
  Move,
} from "lucide-react";

export type EdgeStyle = "curved" | "step" | "straight";
export type LayoutDensity = "comfortable" | "compact";
export type ColorTheme = "crimson" | "emerald" | "sapphire" | "minimal" | "blueprint";
export type BackgroundPattern = "dots" | "grid" | "clean" | "blueprint";
export type StatusFilter = "ALL" | CurriculumStatus;

interface MindMapCustomization {
  edgeStyle: EdgeStyle;
  density: LayoutDensity;
  theme: ColorTheme;
  backgroundPattern: BackgroundPattern;
  statusFilter: StatusFilter;
  showProgressBars: boolean;
  showStatusBadges: boolean;
  showPorts: boolean;
  showCounts: boolean;
  showGlowTrails: boolean;
}

interface CurriculumMindMapProps {
  hierarchyRoot: CurriculumHierarchyNode | null;
  records: CurriculumRecord[];
  activeRecord: CurriculumRecord | null;
  onSelectRecord: (record: CurriculumRecord | null) => void;
  searchQuery: string;
  selectedGrade?: number | null;
  onAddUnderNode?: (grade: number, chapter: string, category: string) => void;
  onQuickStatusChange?: (
    videoId: string,
    nextStatus: CurriculumStatus
  ) => Promise<void>;
  onDeleteRecord?: (videoId: string) => Promise<boolean>;
  highlightedRecordId?: string | null;
  onSelectTopicForQuiz?: (topicId: string) => void;
  onOpenPdfStorage?: (grade?: number, chapter?: string) => void;
  onSyncMasterSkeleton?: () => Promise<void> | void;
}

interface VisualNode {
  id: string;
  type: "root" | "grade" | "chapter" | "category" | "record";
  label: string;
  sublabel?: string;
  status?: CurriculumStatus;
  gradeNum?: number;
  chapterName?: string;
  categoryName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  expanded?: boolean;
  hasChildren?: boolean;
  childCount?: number;
  progressPercent?: number;
  statusBreakdown?: {
    done: number;
    inProgress: number;
    onHold: number;
    notStarted: number;
    total: number;
  };
  record?: CurriculumRecord;
  parentId?: string;
  highlighted?: boolean;
  dimmed?: boolean;
}

interface VisualEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

const NEXT_STATUS: Record<CurriculumStatus, CurriculumStatus> = {
  "Not Started": "In Progress",
  "In Progress": "Done",
  Done: "On Hold",
  "On Hold": "Not Started",
};

const STORAGE_KEY = "edinno_mindmap_customization_v2";

const DEFAULT_CUSTOMIZATION: MindMapCustomization = {
  edgeStyle: "curved",
  density: "comfortable",
  theme: "crimson",
  backgroundPattern: "dots",
  statusFilter: "ALL",
  showProgressBars: true,
  showStatusBadges: true,
  showPorts: true,
  showCounts: true,
  showGlowTrails: true,
};

export function CurriculumMindMap({
  hierarchyRoot,
  records,
  activeRecord,
  onSelectRecord,
  searchQuery,
  selectedGrade,
  onAddUnderNode,
  onQuickStatusChange,
  onDeleteRecord,
  highlightedRecordId,
  onSelectTopicForQuiz,
  onOpenPdfStorage,
  onSyncMasterSkeleton,
}: CurriculumMindMapProps) {
  // Customization Options with Auto-Restore from localStorage
  const [customization, setCustomization] = useState<MindMapCustomization>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          return { ...DEFAULT_CUSTOMIZATION, ...JSON.parse(saved) };
        }
      } catch {
        // ignore JSON parse error
      }
    }
    return DEFAULT_CUSTOMIZATION;
  });

  const updateCustomization = useCallback(
    (
      patchOrUpdater:
        | Partial<MindMapCustomization>
        | ((prev: MindMapCustomization) => MindMapCustomization)
    ) => {
      setCustomization((prev) => {
        const next =
          typeof patchOrUpdater === "function"
            ? patchOrUpdater(prev)
            : { ...prev, ...patchOrUpdater };
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore localStorage quota error
          }
        }
        return next;
      });
    },
    []
  );

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 70, y: 150 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafPanRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isSyncingMaster, setIsSyncingMaster] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (rafPanRef.current !== null) {
        cancelAnimationFrame(rafPanRef.current);
      }
    };
  }, []);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // UI Panels
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [showZoomMenu, setShowZoomMenu] = useState<boolean>(false);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  // Search Match Cycle Index
  const [searchMatchIndex, setSearchMatchIndex] = useState<number>(0);

  // Collapsed branches set
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // Interactive Node / Tab Dragging and Movement State
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [activeDragNodeId, setActiveDragNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hasMovedTabs, setHasMovedTabs] = useState<boolean>(false);
  const draggingNodeRef = useRef<{
    nodeId: string;
    affectedNodeIds: string[];
    startX: number;
    startY: number;
    initialOffsets: Record<string, { x: number; y: number }>;
  } | null>(null);

  // Helper to gather all descendant node IDs of a given node in the tree
  const getDescendantNodeIds = useCallback(
    (nodeId: string, allNodes: VisualNode[]): string[] => {
      const result: string[] = [nodeId];
      const queue: string[] = [nodeId];
      while (queue.length > 0) {
        const parentId = queue.shift()!;
        for (const n of allNodes) {
          if (n.parentId === parentId) {
            result.push(n.id);
            queue.push(n.id);
          }
        }
      }
      return result;
    },
    []
  );

  // Toggle branch collapse
  const toggleCollapse = useCallback((nodeId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  // Collapse Depth presets
  const setDepth = useCallback(
    (depth: 1 | 2 | 3 | 4) => {
      if (!hierarchyRoot) return;
      const newCollapsed = new Set<string>();

      const walk = (node: CurriculumHierarchyNode, currentDepth: number) => {
        if (node.children && node.children.length > 0) {
          if (node.node_type !== "root" && currentDepth >= depth) {
            newCollapsed.add(node.id);
          }
          node.children.forEach((child) => walk(child, currentDepth + 1));
        }
      };

      walk(hierarchyRoot, 1);
      setCollapsedIds(newCollapsed);
    },
    [hierarchyRoot]
  );

  // Auto-expand ancestors when search query matches without cascading render effect
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    if (searchQuery.trim() && hierarchyRoot) {
      const q = searchQuery.toLowerCase().trim();
      const idsToExpand = new Set<string>();

      const traverse = (node: CurriculumHierarchyNode, ancestors: string[]) => {
        if (node.node_type === "record" && node.record) {
          const r = node.record;
          if (
            r.video_id.toLowerCase().includes(q) ||
            r.chapter.toLowerCase().includes(q) ||
            r.category.toLowerCase().includes(q) ||
            r.status.toLowerCase().includes(q)
          ) {
            ancestors.forEach((aId) => idsToExpand.add(aId));
          }
        }
        if (node.children) {
          node.children.forEach((child) => {
            traverse(child, [...ancestors, node.id]);
          });
        }
      };

      traverse(hierarchyRoot, []);

      if (idsToExpand.size > 0) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          idsToExpand.forEach((id) => next.delete(id));
          return next;
        });
      }
    }
  }

  // Compute Layout Tree Coordinates
  const { nodes, edges, canvasHeight, canvasWidth, matchingNodes } = useMemo(() => {
    if (records.length === 0) {
      return {
        nodes: [],
        edges: [],
        canvasHeight: 620,
        canvasWidth: 800,
        matchingNodes: [],
      };
    }

    const computedNodes: VisualNode[] = [];
    const computedEdges: VisualEdge[] = [];
    const matched: VisualNode[] = [];

    let grades = hierarchyRoot?.children || [];
    if (selectedGrade !== null && selectedGrade !== undefined) {
      grades = grades.filter(
        (g) => g.id === `grade-${selectedGrade}` || g.name.includes(String(selectedGrade))
      );
    }

    const isCompact = customization.density === "compact";
    const ROW_GAP = isCompact ? 60 : 74;

    const rootW = isCompact ? 220 : 250;
    const rootH = isCompact ? 54 : 62;
    const gradeW = isCompact ? 180 : 210;
    const gradeH = isCompact ? 52 : 60;
    const chW = isCompact ? 330 : 400;
    const chH = isCompact ? 56 : 64;
    const catW = isCompact ? 165 : 190;
    const catH = isCompact ? 46 : 52;
    const recW = isCompact ? 350 : 420;
    const recH = isCompact ? 54 : 62;

    const COL_GAP = isCompact ? 50 : 65;
    const X_ROOT = 0;
    const X_GRADE = X_ROOT + rootW + COL_GAP;
    const X_CHAPTER = X_GRADE + gradeW + COL_GAP;
    const X_CATEGORY = X_CHAPTER + chW + COL_GAP;
    const X_RECORD = X_CATEGORY + catW + COL_GAP;

    let currentY = 50;

    // Root Node
    const rootLabel = selectedGrade ? `Grade ${selectedGrade} Curriculum` : "Curriculum Workspace";
    const rootNode: VisualNode = {
      id: "root",
      type: "root",
      label: rootLabel,
      sublabel: `${records.length} Total Records`,
      x: 0,
      y: 0,
      width: rootW,
      height: rootH,
      expanded: true,
      hasChildren: grades.length > 0,
      childCount: grades.length,
    };

    grades.forEach((gradeNode: CurriculumHierarchyNode) => {
      const gradeId = gradeNode.id;
      const isGradeCollapsed = collapsedIds.has(gradeId);
      const gradeStartY = currentY;
      const chapters = gradeNode.children || [];

      const gradeNumMatch = gradeNode.id.match(/\d+/) || gradeNode.name.match(/\d+/);
      const gradeNum = gradeNumMatch ? parseInt(gradeNumMatch[0], 10) : 0;

      const gradeRecords = records.filter((r) => r.grade === gradeNum);
      const doneCount = gradeRecords.filter((r) => r.status === "Done").length;
      const inProgCount = gradeRecords.filter((r) => r.status === "In Progress").length;
      const onHoldCount = gradeRecords.filter((r) => r.status === "On Hold").length;
      const notStartedCount = gradeRecords.filter((r) => r.status === "Not Started").length;
      const progressPercent =
        gradeRecords.length > 0 ? Math.round((doneCount / gradeRecords.length) * 100) : 0;

      if (!isGradeCollapsed) {
        chapters.forEach((chNode: CurriculumHierarchyNode) => {
          const chId = chNode.id;
          const isChCollapsed = collapsedIds.has(chId);
          const chStartY = currentY;
          const categories = chNode.children || [];

          if (!isChCollapsed) {
            categories.forEach((catNode: CurriculumHierarchyNode) => {
              const catId = catNode.id;
              const isCatCollapsed = collapsedIds.has(catId);
              const catStartY = currentY;
              const recNodes = catNode.children || [];

              if (!isCatCollapsed) {
                recNodes.forEach((leafNode: CurriculumHierarchyNode) => {
                  const rec = leafNode.record;
                  if (!rec) return;

                  const recId = leafNode.id;
                  const isMatch =
                    Boolean(searchQuery.trim()) &&
                    (rec.video_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      rec.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      rec.chapter.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      rec.status.toLowerCase().includes(searchQuery.toLowerCase()));

                  const isStatusMatch =
                    customization.statusFilter === "ALL" ||
                    rec.status === customization.statusFilter;

                  const nodeObj: VisualNode = {
                    id: recId,
                    type: "record",
                    label: rec.video_id,
                    sublabel: `#${rec.count} • ${rec.category}`,
                    status: rec.status,
                    gradeNum: rec.grade,
                    chapterName: rec.chapter,
                    categoryName: rec.category,
                    x: X_RECORD,
                    y: currentY,
                    width: recW,
                    height: recH,
                    record: rec,
                    parentId: catId,
                    highlighted: isMatch || highlightedRecordId === rec.video_id,
                    dimmed: !isStatusMatch,
                  };

                  computedNodes.push(nodeObj);
                  if (isMatch) matched.push(nodeObj);

                  computedEdges.push({
                    id: `edge-${catId}-${recId}`,
                    sourceId: catId,
                    targetId: recId,
                    sourceX: X_CATEGORY + catW,
                    sourceY: 0,
                    targetX: X_RECORD,
                    targetY: currentY + recH / 2,
                  });

                  currentY += ROW_GAP;
                });
              } else {
                currentY += ROW_GAP;
              }

              const catY = isCatCollapsed ? catStartY : (catStartY + currentY - ROW_GAP) / 2;
              computedNodes.push({
                id: catId,
                type: "category",
                label: catNode.name,
                sublabel: `${catNode.count} items`,
                gradeNum,
                chapterName: chNode.name,
                categoryName: catNode.name,
                x: X_CATEGORY,
                y: catY,
                width: catW,
                height: catH,
                expanded: !isCatCollapsed,
                hasChildren: (catNode.children || []).length > 0,
                childCount: (catNode.children || []).length,
                parentId: chId,
              });

              computedEdges.forEach((e) => {
                if (e.sourceId === catId) {
                  e.sourceY = catY + catH / 2;
                }
              });

              computedEdges.push({
                id: `edge-${chId}-${catId}`,
                sourceId: chId,
                targetId: catId,
                sourceX: X_CHAPTER + chW,
                sourceY: 0,
                targetX: X_CATEGORY,
                targetY: catY + catH / 2,
              });
            });
          } else {
            currentY += ROW_GAP;
          }

          const chY = isChCollapsed ? chStartY : (chStartY + currentY - ROW_GAP) / 2;
          computedNodes.push({
            id: chId,
            type: "chapter",
            label: chNode.name,
            sublabel: `${chNode.count} records`,
            gradeNum,
            chapterName: chNode.name,
            x: X_CHAPTER,
            y: chY,
            width: chW,
            height: chH,
            expanded: !isChCollapsed,
            hasChildren: (chNode.children || []).length > 0,
            childCount: (chNode.children || []).length,
            parentId: gradeId,
          });

          computedEdges.forEach((e) => {
            if (e.sourceId === chId) {
              e.sourceY = chY + chH / 2;
            }
          });

          computedEdges.push({
            id: `edge-${gradeId}-${chId}`,
            sourceId: gradeId,
            targetId: chId,
            sourceX: X_GRADE + gradeW,
            sourceY: 0,
            targetX: X_CHAPTER,
            targetY: chY + chH / 2,
          });
        });
      } else {
        currentY += ROW_GAP;
      }

      const gradeY = isGradeCollapsed ? gradeStartY : (gradeStartY + currentY - ROW_GAP) / 2;
      computedNodes.push({
        id: gradeId,
        type: "grade",
        label: gradeNode.name,
        sublabel: `${(gradeNode.children || []).length} chs • ${gradeRecords.length} records`,
        gradeNum,
        progressPercent,
        statusBreakdown: {
          done: doneCount,
          inProgress: inProgCount,
          onHold: onHoldCount,
          notStarted: notStartedCount,
          total: gradeRecords.length,
        },
        x: X_GRADE,
        y: gradeY,
        width: gradeW,
        height: gradeH,
        expanded: !isGradeCollapsed,
        hasChildren: (gradeNode.children || []).length > 0,
        childCount: (gradeNode.children || []).length,
        parentId: "root",
      });

      computedEdges.forEach((e) => {
        if (e.sourceId === gradeId) {
          e.sourceY = gradeY + gradeH / 2;
        }
      });

      computedEdges.push({
        id: `edge-root-${gradeId}`,
        sourceId: "root",
        targetId: gradeId,
        sourceX: X_ROOT + rootW,
        sourceY: 0,
        targetX: X_GRADE,
        targetY: gradeY + gradeH / 2,
      });
    });

    rootNode.y = currentY > 50 ? (50 + currentY - ROW_GAP) / 2 - rootH / 2 : 120;
    computedNodes.unshift(rootNode);

    computedEdges.forEach((e) => {
      if (e.sourceId === "root") {
        e.sourceY = rootNode.y + rootH / 2;
      }
    });

    return {
      nodes: computedNodes,
      edges: computedEdges,
      canvasHeight: Math.max(currentY + 160, 620),
      canvasWidth: X_RECORD + recW + 200,
      matchingNodes: matched,
    };
  }, [hierarchyRoot, records, collapsedIds, searchQuery, selectedGrade, highlightedRecordId, customization.density, customization.statusFilter]);

  // Active path calculation (connecting root to selected leaf node)
  const activeEdgeIds = useMemo(() => {
    if (!activeRecord) return new Set<string>();
    const recId = `rec-${activeRecord.video_id}`;
    const activeIds = new Set<string>();

    let currentId: string | undefined = recId;
    while (currentId && currentId !== "root") {
      const incomingEdge = edges.find((e) => e.targetId === currentId);
      if (incomingEdge) {
        activeIds.add(incomingEdge.id);
        currentId = incomingEdge.sourceId;
      } else {
        break;
      }
    }
    return activeIds;
  }, [activeRecord, edges]);

  // Center on node helper
  const centerOnNode = useCallback(
    (node: VisualNode) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const targetPanX = rect.width / 2 - (node.x + node.width / 2) * zoom;
      const targetPanY = rect.height / 2 - (node.y + node.height / 2) * zoom;
      setPan({ x: targetPanX, y: targetPanY });
    },
    [zoom]
  );

  // Jump between search matches
  const handleNextSearchMatch = () => {
    if (matchingNodes.length === 0) return;
    const nextIdx = (searchMatchIndex + 1) % matchingNodes.length;
    setSearchMatchIndex(nextIdx);
    centerOnNode(matchingNodes[nextIdx]);
    if (matchingNodes[nextIdx].record) {
      onSelectRecord(matchingNodes[nextIdx].record!);
    }
  };

  const handlePrevSearchMatch = () => {
    if (matchingNodes.length === 0) return;
    const prevIdx = (searchMatchIndex - 1 + matchingNodes.length) % matchingNodes.length;
    setSearchMatchIndex(prevIdx);
    centerOnNode(matchingNodes[prevIdx]);
    if (matchingNodes[prevIdx].record) {
      onSelectRecord(matchingNodes[prevIdx].record!);
    }
  };

  // Interactive Node / Tab Drag Handlers
  const handleNodeMouseDown = useCallback(
    (node: VisualNode, e: React.MouseEvent) => {
      if (
        (e.target as HTMLElement).closest("button") ||
        (e.target as HTMLElement).closest("a") ||
        (e.target as HTMLElement).closest("input")
      ) {
        return;
      }
      e.stopPropagation();

      setSelectedNodeId(node.id);
      if (node.record) onSelectRecord(node.record);

      const moveSingle = e.altKey;
      const affected = moveSingle ? [node.id] : getDescendantNodeIds(node.id, nodes);

      const initial: Record<string, { x: number; y: number }> = {};
      affected.forEach((id) => {
        initial[id] = { ...(nodeOffsets[id] || { x: 0, y: 0 }) };
      });

      draggingNodeRef.current = {
        nodeId: node.id,
        affectedNodeIds: affected,
        startX: e.clientX,
        startY: e.clientY,
        initialOffsets: initial,
      };
      setActiveDragNodeId(node.id);
    },
    [nodes, nodeOffsets, getDescendantNodeIds, onSelectRecord]
  );

  const handleNodeTouchStart = useCallback(
    (node: VisualNode, e: React.TouchEvent) => {
      if (
        (e.target as HTMLElement).closest("button") ||
        (e.target as HTMLElement).closest("a") ||
        (e.target as HTMLElement).closest("input")
      ) {
        return;
      }
      if (e.touches.length !== 1) return;
      e.stopPropagation();

      setSelectedNodeId(node.id);
      if (node.record) onSelectRecord(node.record);

      const affected = getDescendantNodeIds(node.id, nodes);
      const initial: Record<string, { x: number; y: number }> = {};
      affected.forEach((id) => {
        initial[id] = { ...(nodeOffsets[id] || { x: 0, y: 0 }) };
      });

      draggingNodeRef.current = {
        nodeId: node.id,
        affectedNodeIds: affected,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        initialOffsets: initial,
      };
      setActiveDragNodeId(node.id);
    },
    [nodes, nodeOffsets, getDescendantNodeIds, onSelectRecord]
  );

  // Pan & Node dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".mindmap-interactive")) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeRef.current) {
      const { affectedNodeIds, startX, startY, initialOffsets } = draggingNodeRef.current;
      const deltaX = (e.clientX - startX) / zoom;
      const deltaY = (e.clientY - startY) / zoom;

      if (rafPanRef.current !== null) {
        cancelAnimationFrame(rafPanRef.current);
      }
      rafPanRef.current = requestAnimationFrame(() => {
        setNodeOffsets((prev) => {
          const next = { ...prev };
          affectedNodeIds.forEach((id) => {
            const init = initialOffsets[id] || { x: 0, y: 0 };
            next[id] = {
              x: Math.round(init.x + deltaX),
              y: Math.round(init.y + deltaY),
            };
          });
          return next;
        });
        setHasMovedTabs(true);
        rafPanRef.current = null;
      });
      return;
    }

    if (!isDragging) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    if (rafPanRef.current !== null) {
      cancelAnimationFrame(rafPanRef.current);
    }
    rafPanRef.current = requestAnimationFrame(() => {
      setPan({
        x: clientX - dragStartRef.current.x,
        y: clientY - dragStartRef.current.y,
      });
      rafPanRef.current = null;
    });
  };

  const handleMouseUp = () => {
    if (rafPanRef.current !== null) {
      cancelAnimationFrame(rafPanRef.current);
      rafPanRef.current = null;
    }
    if (draggingNodeRef.current) {
      draggingNodeRef.current = null;
      setActiveDragNodeId(null);
    }
    setIsDragging(false);
  };

  // Touch panning for tablet & touch displays
  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest(".mindmap-interactive")) return;
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;

    if (draggingNodeRef.current) {
      const { affectedNodeIds, startX, startY, initialOffsets } = draggingNodeRef.current;
      const deltaX = (e.touches[0].clientX - startX) / zoom;
      const deltaY = (e.touches[0].clientY - startY) / zoom;

      if (rafPanRef.current !== null) {
        cancelAnimationFrame(rafPanRef.current);
      }
      rafPanRef.current = requestAnimationFrame(() => {
        setNodeOffsets((prev) => {
          const next = { ...prev };
          affectedNodeIds.forEach((id) => {
            const init = initialOffsets[id] || { x: 0, y: 0 };
            next[id] = {
              x: Math.round(init.x + deltaX),
              y: Math.round(init.y + deltaY),
            };
          });
          return next;
        });
        setHasMovedTabs(true);
        rafPanRef.current = null;
      });
      return;
    }

    if (!isDragging) return;
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    if (rafPanRef.current !== null) {
      cancelAnimationFrame(rafPanRef.current);
    }
    rafPanRef.current = requestAnimationFrame(() => {
      setPan({
        x: touchX - dragStartRef.current.x,
        y: touchY - dragStartRef.current.y,
      });
      rafPanRef.current = null;
    });
  };

  const handleTouchEnd = () => {
    if (rafPanRef.current !== null) {
      cancelAnimationFrame(rafPanRef.current);
      rafPanRef.current = null;
    }
    if (draggingNodeRef.current) {
      draggingNodeRef.current = null;
      setActiveDragNodeId(null);
    }
    setIsDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.max(0.25, Math.min(2.5, prev * delta)));
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Zoom presets
  const handleZoomIn = useCallback(
    () => setZoom((prev) => Math.min(2.2, prev * 1.15)),
    []
  );
  const handleZoomOut = useCallback(
    () => setZoom((prev) => Math.max(0.25, prev * 0.85)),
    []
  );
  const handleFitScreen = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / (canvasWidth + 60);
    const scaleY = rect.height / (canvasHeight + 60);
    const fitZoom = Math.max(0.4, Math.min(1.0, Math.min(scaleX, scaleY)));
    setZoom(fitZoom);
    setPan({ x: 50, y: 80 });
  }, [canvasWidth, canvasHeight]);

  const handleCenter = useCallback(() => {
    setPan({ x: 80, y: 150 });
    setZoom(0.85);
  }, []);

  // Fullscreen container toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  // Copy Video ID
  const handleCopyVideoId = (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(videoId);
    setCopiedNotification(`Copied: ${videoId}`);
    setTimeout(() => setCopiedNotification(null), 2000);
  };

  // Export High-Res PNG Image
  const handleExportPng = () => {
    const svg = document.getElementById("curriculum-mindmap-svg");
    if (!svg) return;
    try {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svg);
      const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2;
        canvas.width = (canvasWidth || 1600) * scale;
        canvas.height = (canvasHeight || 1200) * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = customization.theme === "blueprint" ? "#0B132B" : "#FDFBF7";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          const a = document.createElement("a");
          a.href = canvas.toDataURL("image/png");
          a.download = `curriculum_mindmap_${new Date().toISOString().slice(0, 10)}.png`;
          a.click();
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (err) {
      console.error("Failed to export PNG:", err);
    }
    setShowExportMenu(false);
  };

  // Export Scalable Vector Graphic (SVG)
  const handleExportSvg = () => {
    const svg = document.getElementById("curriculum-mindmap-svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgBlob = new Blob([serializer.serializeToString(svg)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `curriculum_mindmap_${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // Export JSON Tree Structure
  const handleExportJson = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(hierarchyRoot, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = `curriculum_hierarchy_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setShowExportMenu(false);
  };

  // Build Markdown Syllabus Outline
  const buildMarkdownOutline = () => {
    if (!hierarchyRoot) return "# Curriculum Mind Map\n\nNo records.";
    let md = `# Curriculum Architecture & Syllabus Outline\nExported: ${new Date().toLocaleDateString()}\n\n`;
    (hierarchyRoot.children || []).forEach((grade) => {
      md += `## ${grade.name}\n\n`;
      (grade.children || []).forEach((chap) => {
        md += `### ${chap.name}\n`;
        (chap.children || []).forEach((cat) => {
          md += `#### ${cat.name}\n`;
          (cat.children || []).forEach((item) => {
            const check = item.status === "Done" ? "[x]" : "[ ]";
            md += `- ${check} **${item.name}**\n`;
          });
          md += `\n`;
        });
      });
    });
    return md;
  };

  // Copy Markdown Outline to Clipboard
  const handleCopyMarkdown = async () => {
    const md = buildMarkdownOutline();
    try {
      await navigator.clipboard.writeText(md);
      setCopiedNotification("Copied Curriculum Markdown outline to clipboard!");
      setTimeout(() => setCopiedNotification(null), 3000);
    } catch {
      // fallback
    }
    setShowExportMenu(false);
  };

  // Download Markdown Outline File
  const handleDownloadMarkdown = () => {
    const md = buildMarkdownOutline();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `curriculum_syllabus_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // Window-level mouse move and up listeners for seamless tab dragging across entire viewport
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (draggingNodeRef.current) {
        const { affectedNodeIds, startX, startY, initialOffsets } = draggingNodeRef.current;
        const deltaX = (e.clientX - startX) / zoom;
        const deltaY = (e.clientY - startY) / zoom;

        setNodeOffsets((prev) => {
          const next = { ...prev };
          affectedNodeIds.forEach((id) => {
            const init = initialOffsets[id] || { x: 0, y: 0 };
            next[id] = {
              x: Math.round(init.x + deltaX),
              y: Math.round(init.y + deltaY),
            };
          });
          return next;
        });
        setHasMovedTabs(true);
      }
    };

    const handleWindowMouseUp = () => {
      if (draggingNodeRef.current) {
        draggingNodeRef.current = null;
        setActiveDragNodeId(null);
      }
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [zoom]);

  // Global MindMap Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(activeTag)) return;

      // Arrow keys to nudge selected tab pixel-by-pixel
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
        selectedNodeId
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : 10;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setNodeOffsets((prev) => {
          const cur = prev[selectedNodeId] || { x: 0, y: 0 };
          return {
            ...prev,
            [selectedNodeId]: { x: cur.x + dx, y: cur.y + dy },
          };
        });
        setHasMovedTabs(true);
        return;
      }

      // 'R' shortcut to reset moved tabs to default layout
      if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setNodeOffsets({});
        setHasMovedTabs(false);
        setCopiedNotification("Reset tab positions to default auto-layout");
        setTimeout(() => setCopiedNotification(null), 2000);
        return;
      }

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1.0);
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        handleFitScreen();
      } else if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCenter();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        setShowSettings((prev) => !prev);
      } else if (e.key === "Escape") {
        setShowSettings(false);
        setShowExportMenu(false);
        setShowZoomMenu(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleZoomIn, handleZoomOut, handleFitScreen, handleCenter, selectedNodeId]);

  // Edge Path Generator based on Customization
  const getEdgePath = (edge: VisualEdge) => {
    const { sourceX, sourceY, targetX, targetY } = edge;
    const style = customization.edgeStyle;

    if (style === "straight") {
      return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    }

    if (style === "step") {
      const midX = (sourceX + targetX) / 2;
      const deltaY = targetY - sourceY;
      const signY = deltaY >= 0 ? 1 : -1;
      const radius = Math.min(14, Math.abs(deltaY) / 2, Math.abs(targetX - sourceX) / 2);

      if (Math.abs(deltaY) < 4) {
        return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
      }

      return `M ${sourceX} ${sourceY} L ${midX - radius} ${sourceY} Q ${midX} ${sourceY} ${midX} ${sourceY + radius * signY} L ${midX} ${targetY - radius * signY} Q ${midX} ${targetY} ${midX + radius} ${targetY} L ${targetX} ${targetY}`;
    }

    // Default: Organic smooth Cubic Bézier
    const midX = (sourceX + targetX) / 2;
    return `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;
  };

  // Theme-specific styles
  const themeStyles = useMemo(() => {
    switch (customization.theme) {
      case "emerald":
        return {
          rootBg: "bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-950 text-white border-emerald-900 shadow-emerald-950/20",
          accentColor: "#059669",
          activeEdge: "#10B981",
          canvasBg: "bg-[#F7FAF8]",
        };
      case "sapphire":
        return {
          rootBg: "bg-gradient-to-r from-blue-800 via-indigo-800 to-blue-950 text-white border-blue-900 shadow-blue-950/20",
          accentColor: "#2563EB",
          activeEdge: "#3B82F6",
          canvasBg: "bg-[#F8FAFC]",
        };
      case "minimal":
        return {
          rootBg: "bg-gradient-to-r from-stone-800 via-stone-900 to-black text-white border-stone-900 shadow-stone-950/20",
          accentColor: "#57534E",
          activeEdge: "#78716C",
          canvasBg: "bg-[#F5F5F4]",
        };
      case "blueprint":
        return {
          rootBg: "bg-gradient-to-r from-sky-700 via-blue-800 to-slate-900 text-white border-sky-500 shadow-blue-950/30",
          accentColor: "#38BDF8",
          activeEdge: "#38BDF8",
          canvasBg: "bg-[#0B132B]",
        };
      case "crimson":
      default:
        return {
          rootBg: "bg-gradient-to-r from-[#B81104] via-[#A00F03] to-[#8F0D03] text-[#FFFACD] border-[#7A0B02] shadow-[#B81104]/20",
          accentColor: "#B81104",
          activeEdge: "#B81104",
          canvasBg: "bg-[#FDFBF7]",
        };
    }
  }, [customization.theme]);

  // Category Icon Resolver
  const getCategoryIcon = (category?: string) => {
    const cat = (category || "").toLowerCase();
    if (cat.includes("topic") || cat.includes("theory") || cat.includes("lecture")) {
      return <BookOpen className="w-3.5 h-3.5 text-blue-600" />;
    }
    if (cat.includes("act") || cat.includes("lab") || cat.includes("exp")) {
      return <Zap className="w-3.5 h-3.5 text-amber-600" />;
    }
    if (cat.includes("proj") || cat.includes("build") || cat.includes("maker")) {
      return <Folder className="w-3.5 h-3.5 text-purple-600" />;
    }
    if (cat.includes("quiz") || cat.includes("assess") || cat.includes("test")) {
      return <Award className="w-3.5 h-3.5 text-emerald-600" />;
    }
    return <FileText className="w-3.5 h-3.5 text-stone-500" />;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      className={`relative w-full h-[640px] ${themeStyles.canvasBg} border border-stone-200/90 rounded-md overflow-hidden select-none cursor-grab active:cursor-grabbing shadow-xs transition-colors duration-200`}
    >
      {/* Dynamic Background Pattern */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          {customization.backgroundPattern === "dots" && (
            <>
              <pattern id="mindmap-subgrid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle
                  cx="1.5"
                  cy="1.5"
                  r="1"
                  fill={customization.theme === "blueprint" ? "#38BDF8" : "#D6D3D1"}
                  opacity={customization.theme === "blueprint" ? "0.4" : "0.7"}
                />
              </pattern>
              <pattern id="mindmap-maingrid" width="120" height="120" patternUnits="userSpaceOnUse">
                <rect width="120" height="120" fill="url(#mindmap-subgrid)" />
                <path
                  d="M 120 0 L 0 0 0 120"
                  fill="none"
                  stroke={customization.theme === "blueprint" ? "#1E293B" : "#E7E5E4"}
                  strokeWidth="1"
                  opacity={customization.theme === "blueprint" ? "0.5" : "0.4"}
                />
              </pattern>
            </>
          )}
          {customization.backgroundPattern === "grid" && (
            <pattern id="mindmap-maingrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke={customization.theme === "blueprint" ? "#1E293B" : "#EAE5D9"}
                strokeWidth="1"
                opacity="0.75"
              />
            </pattern>
          )}
          {customization.backgroundPattern === "blueprint" && (
            <>
              <pattern id="mindmap-bp-sub" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1E293B" strokeWidth="0.75" opacity="0.8" />
              </pattern>
              <pattern id="mindmap-maingrid" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect width="100" height="100" fill="url(#mindmap-bp-sub)" />
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#0284C7" strokeWidth="1.2" opacity="0.3" />
              </pattern>
            </>
          )}
        </defs>
        {customization.backgroundPattern !== "clean" && (
          <rect width="100%" height="100%" fill="url(#mindmap-maingrid)" />
        )}
      </svg>

      {/* Copied Notification Toast */}
      {copiedNotification && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded bg-stone-900 text-white text-xs font-bold shadow-xl border border-stone-700 animate-in fade-in duration-150">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* Main Mind Map Transform Layer */}
      <div
        ref={canvasRef}
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: "0 0",
          width: canvasWidth,
          height: canvasHeight,
          willChange: "transform",
        }}
        className="absolute inset-0 transition-transform duration-75"
      >
        {/* Connection Edges Layer */}
        <svg
          id="curriculum-mindmap-svg"
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: "visible" }}
        >
          <defs>
            <filter id="trail-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {edges.map((edge) => {
            const isActive = activeEdgeIds.has(edge.id);
            const srcOffset = nodeOffsets[edge.sourceId] || { x: 0, y: 0 };
            const tgtOffset = nodeOffsets[edge.targetId] || { x: 0, y: 0 };

            const dynamicEdge: VisualEdge = {
              ...edge,
              sourceX: edge.sourceX + srcOffset.x,
              sourceY: edge.sourceY + srcOffset.y,
              targetX: edge.targetX + tgtOffset.x,
              targetY: edge.targetY + tgtOffset.y,
            };

            const pathData = getEdgePath(dynamicEdge);

            return (
              <g key={edge.id}>
                {/* Glowing trail effect */}
                {isActive && customization.showGlowTrails && (
                  <path
                    d={pathData}
                    fill="none"
                    stroke={themeStyles.activeEdge}
                    strokeWidth={6}
                    strokeOpacity={0.25}
                    strokeLinecap="round"
                    filter="url(#trail-glow)"
                  />
                )}
                {/* Main line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={isActive ? themeStyles.activeEdge : "#D6D3D1"}
                  strokeWidth={isActive ? 2.75 : 1.75}
                  strokeLinecap="round"
                  className="transition-colors duration-200"
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes Layer */}
        {nodes.map((node) => {
          const isSelected =
            activeRecord?.video_id === node.record?.video_id ||
            selectedNodeId === node.id;
          const offset = nodeOffsets[node.id] || { x: 0, y: 0 };
          const effectiveX = node.x + offset.x;
          const effectiveY = node.y + offset.y;
          const isNodeDragging = activeDragNodeId === node.id;

          const colonIdx = node.label.indexOf(":");
          const hasCode = colonIdx > 0 && colonIdx <= 15;
          const recCode = hasCode ? node.label.slice(0, colonIdx).trim() : null;
          const recTitle = hasCode ? node.label.slice(colonIdx + 1).trim() : node.label;

          return (
            <div
              key={node.id}
              title={node.label}
              style={{
                left: `${effectiveX}px`,
                top: `${effectiveY}px`,
                width: `${node.width}px`,
                height: `${node.height}px`,
                zIndex: isNodeDragging ? 40 : undefined,
              }}
              onMouseDown={(e) => handleNodeMouseDown(node, e)}
              onTouchStart={(e) => handleNodeTouchStart(node, e)}
              onClick={() => {
                setSelectedNodeId(node.id);
                if (node.record) onSelectRecord(node.record);
              }}
              className={`mindmap-interactive absolute rounded-md border flex items-center justify-between shadow-xs transition-shadow duration-150 select-none ${
                isNodeDragging
                  ? "cursor-grabbing shadow-2xl ring-2 ring-[#B81104] scale-[1.02] z-40 bg-white"
                  : "cursor-grab"
              } ${
                node.type === "root"
                  ? `${themeStyles.rootBg} shadow-lg p-3`
                  : node.type === "grade"
                  ? "bg-white border-blue-200 hover:border-blue-400 hover:shadow-md text-stone-900 p-2.5"
                  : node.type === "chapter"
                  ? "bg-white border-stone-200 hover:border-stone-400 hover:shadow-md text-stone-800 p-2.5"
                  : node.type === "category"
                  ? "bg-stone-50/90 border-stone-200 hover:border-stone-400 hover:shadow-md text-stone-700 p-2"
                  : isSelected
                  ? "bg-red-50/90 border-[#B81104] ring-3 ring-[#B81104]/30 shadow-lg scale-[1.02] text-stone-900 p-2.5 z-20"
                  : node.highlighted
                  ? "bg-amber-50 border-amber-400 ring-2 ring-amber-300 shadow-md text-stone-900 p-2.5 z-10"
                  : "bg-white border-stone-200 hover:border-stone-400 hover:shadow-md text-stone-800 p-2.5"
              }`}
            >
              {/* Optional Connection Port Anchor (Input) */}
              {customization.showPorts && node.type !== "root" && (
                <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-stone-400 shadow-xs pointer-events-none" />
              )}

              {/* Left Content Area */}
              <div className="flex items-center gap-1.5 truncate min-w-0 flex-1">
                {/* Visual Drag / Move Grip Handle */}
                <div
                  className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-stone-100 text-stone-300 group-hover:text-stone-500 hover:text-stone-800 transition-colors shrink-0 flex items-center justify-center select-none"
                  title="Drag to move this tab (Hold Alt to move single tab)"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                {/* Node Icons */}
                {node.type === "root" && (
                  <div className="w-8 h-8 rounded bg-white/15 flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4 text-[#FFFACD]" />
                  </div>
                )}
                {node.type === "grade" && (
                  <div className="w-7 h-7 rounded bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-black text-xs shrink-0">
                    G{node.gradeNum}
                  </div>
                )}
                {node.type === "chapter" && (
                  <div className="w-7 h-7 rounded bg-stone-100 border border-stone-200 text-stone-600 flex items-center justify-center shrink-0">
                    <Folder className="w-3.5 h-3.5" />
                  </div>
                )}
                {node.type === "category" && (
                  <div className="w-6 h-6 rounded-md bg-stone-200/70 text-stone-700 flex items-center justify-center shrink-0">
                    {getCategoryIcon(node.categoryName)}
                  </div>
                )}

                {/* Typography & Subtitles */}
                {node.type === "record" ? (
                  <div className="truncate min-w-0 flex-1 pr-1" title={node.label}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      {recCode && (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200/90 font-mono text-[10px] font-bold text-stone-700 shrink-0">
                          {recCode}
                        </span>
                      )}
                      <span
                        className="text-xs font-bold text-stone-900 truncate flex-1 leading-snug"
                        title={recTitle}
                      >
                        {recTitle}
                      </span>
                    </div>
                    <p className="text-[10px] text-stone-400 font-medium truncate mt-0.5">
                      #{node.record?.count} • {node.categoryName} • Grade {node.gradeNum}
                    </p>
                  </div>
                ) : node.type === "chapter" ? (
                  <div className="truncate min-w-0 flex-1 pr-1" title={node.label}>
                    <p
                      className="text-xs font-bold text-stone-900 truncate leading-snug"
                      title={node.label}
                    >
                      {node.label}
                    </p>
                    <p className="text-[10px] text-stone-400 font-medium truncate mt-0.5">
                      {node.childCount} categories • Grade {node.gradeNum} • {node.sublabel}
                    </p>
                  </div>
                ) : (
                  <div className="truncate min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <p
                        className={`text-xs font-black truncate leading-tight ${
                          node.type === "root" ? "text-white" : "text-stone-900"
                        }`}
                        title={node.label}
                      >
                        {node.label}
                      </p>
                    </div>

                    {node.sublabel && (
                      <p
                        className={`text-[10px] truncate leading-tight mt-0.5 ${
                          node.type === "root" ? "text-white/80" : "text-stone-400 font-medium"
                        }`}
                      >
                        {node.sublabel}
                      </p>
                    )}

                    {/* Segmented Status Bar for Grade Nodes */}
                    {node.type === "grade" &&
                      customization.showProgressBars &&
                      node.statusBreakdown &&
                      node.statusBreakdown.total > 0 && (
                        <div className="w-full h-1 bg-stone-100 rounded-full overflow-hidden mt-1.5 flex border border-stone-200/80">
                          <div
                            style={{
                              width: `${(node.statusBreakdown.done / node.statusBreakdown.total) * 100}%`,
                            }}
                            className="bg-emerald-500 h-full"
                            title={`Done: ${node.statusBreakdown.done}`}
                          />
                          <div
                            style={{
                              width: `${(node.statusBreakdown.inProgress / node.statusBreakdown.total) * 100}%`,
                            }}
                            className="bg-blue-500 h-full"
                            title={`In Progress: ${node.statusBreakdown.inProgress}`}
                          />
                          <div
                            style={{
                              width: `${(node.statusBreakdown.onHold / node.statusBreakdown.total) * 100}%`,
                            }}
                            className="bg-amber-500 h-full"
                            title={`On Hold: ${node.statusBreakdown.onHold}`}
                          />
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* Right Side Actions & Status */}
              <div className="flex items-center gap-1 shrink-0 ml-1.5">
                {/* Record Leaf Status Pill (Interactive Cycle) */}
                {node.type === "record" && customization.showStatusBadges && (
                  <button
                    type="button"
                    onClick={(e) => {
                      if (node.record && onQuickStatusChange) {
                        e.stopPropagation();
                        onQuickStatusChange(
                          node.record.video_id,
                          NEXT_STATUS[node.status || "Not Started"]
                        );
                      }
                    }}
                    title="Click to cycle status"
                    className="cursor-pointer hover:scale-105 transition-transform"
                  >
                    <CurriculumStatusBadge status={node.status || "Not Started"} size="sm" />
                  </button>
                )}

                {/* Chapter Integrations: Studio Quiz & PDF Storage */}
                {node.type === "chapter" && onSelectTopicForQuiz && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTopicForQuiz(node.chapterName || node.label);
                    }}
                    title="Assess this Chapter in Studio"
                    className="w-5 h-5 rounded hover:bg-red-50 text-stone-400 hover:text-[#B81104] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>
                )}
                {node.type === "chapter" && onOpenPdfStorage && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPdfStorage(node.gradeNum, node.chapterName);
                    }}
                    title="View Chapter PDFs"
                    className="w-5 h-5 rounded hover:bg-blue-50 text-stone-400 hover:text-blue-600 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Cloud className="w-3 h-3" />
                  </button>
                )}

                {/* Quick Add Button on Chapter or Category */}
                {(node.type === "chapter" || node.type === "category") && onAddUnderNode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddUnderNode(
                        node.gradeNum ?? (selectedGrade ?? 0),
                        node.chapterName || "",
                        node.categoryName || "Topic"
                      );
                    }}
                    title="Add new record under this branch"
                    className="w-5 h-5 rounded hover:bg-stone-200 text-stone-500 hover:text-stone-900 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}

                {/* Expand / Collapse Pill */}
                {node.hasChildren && node.type !== "root" && (
                  <button
                    type="button"
                    onClick={(e) => toggleCollapse(node.id, e)}
                    aria-label={node.expanded ? "Collapse branch" : "Expand branch"}
                    title={node.expanded ? "Collapse branch" : "Expand branch"}
                    className="inline-flex items-center justify-center w-5 h-5 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors cursor-pointer"
                  >
                    {node.expanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                )}

                {/* Quick Row Hover Actions (Copy / Delete) */}
                {node.type === "record" && (
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => handleCopyVideoId(node.label, e)}
                      className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                      title="Copy Video ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {onDeleteRecord && node.record && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete record ${node.record?.video_id}?`)) {
                            onDeleteRecord(node.record!.video_id);
                          }
                        }}
                        className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Optional Output Connection Port Anchor */}
              {customization.showPorts && node.hasChildren && (
                <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-stone-400 shadow-xs pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Top-Left HUD (Breadcrumb & Depth Level Jumpers) */}
      <div className="absolute top-3.5 left-4 flex flex-wrap items-center gap-2 z-20 pointer-events-auto">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/95 backdrop-blur-md border border-stone-200 text-xs font-bold text-stone-700 shadow-xs">
          <Compass className="w-3.5 h-3.5 text-[#B81104]" />
          <span>Curriculum Architecture</span>
        </div>

        {/* Depth Presets Bar */}
        <div className="hidden sm:flex items-center p-0.5 rounded-md bg-white/95 backdrop-blur-md border border-stone-200 shadow-xs text-[11px] font-bold text-stone-600">
          <span className="px-2 text-[10px] uppercase font-black text-stone-400">Depth:</span>
          <button
            type="button"
            onClick={() => setDepth(1)}
            className="px-2 py-1 rounded hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
            title="Collapse to Grades"
          >
            Grades
          </button>
          <button
            type="button"
            onClick={() => setDepth(2)}
            className="px-2 py-1 rounded hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
            title="Collapse to Chapters"
          >
            Chapters
          </button>
          <button
            type="button"
            onClick={() => setDepth(3)}
            className="px-2 py-1 rounded hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
            title="Collapse to Categories"
          >
            Categories
          </button>
          <button
            type="button"
            onClick={() => setDepth(4)}
            className="px-2 py-1 rounded hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
            title="Expand All Records"
          >
            All
          </button>
        </div>

        {/* Search Match Navigator (When active matches exist) */}
        {matchingNodes.length > 0 && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-400/30 text-amber-900 text-xs font-bold shadow-xs">
            <Search className="w-3 h-3 text-amber-600" />
            <span>
              {searchMatchIndex + 1}/{matchingNodes.length}
            </span>
            <button
              type="button"
              onClick={handlePrevSearchMatch}
              className="p-0.5 rounded hover:bg-amber-200/50 cursor-pointer"
              title="Previous match"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={handleNextSearchMatch}
              className="p-0.5 rounded hover:bg-amber-200/50 cursor-pointer"
              title="Next match"
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {/* Copied Notification Toast */}
      {copiedNotification && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-900 text-[#FFFACD] text-xs font-bold shadow-lg z-30 animate-in fade-in slide-in-from-top-2 duration-150">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* Active Node Integration Action HUD (Floating directly above control toolbar) */}
      {activeRecord && (
        <div className="absolute bottom-16 left-4 flex flex-wrap items-center gap-2 p-2 rounded-md bg-white/95 backdrop-blur-md border border-stone-200 shadow-xl z-20 animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-[calc(100%-2rem)]">
          <div className="flex items-center gap-2 pr-2 border-r border-stone-200 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#B81104] animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-mono text-xs font-black text-stone-900 truncate">
                  {activeRecord.video_id}
                </span>
                <CurriculumStatusBadge status={activeRecord.status || "Not Started"} size="sm" />
              </div>
              <p className="text-[10px] text-stone-500 truncate max-w-[200px]">
                {activeRecord.chapter} • Grade {activeRecord.grade}
              </p>
            </div>
          </div>

          {/* Integration: Assess in Studio */}
          {onSelectTopicForQuiz && (
            <button
              type="button"
              onClick={() =>
                onSelectTopicForQuiz(activeRecord.chapter || activeRecord.video_id)
              }
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#B81104] hover:bg-[#8F0D03] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer shrink-0"
              title="Generate Assessment for this topic in Studio"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FFFACD]" />
              <span>Assess in Studio</span>
            </button>
          )}

          {/* Integration: Curriculum PDFs */}
          {onOpenPdfStorage && (
            <button
              type="button"
              onClick={() => onOpenPdfStorage(activeRecord.grade, activeRecord.chapter)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors cursor-pointer shrink-0"
              title="View PDF courseware & files for this topic"
            >
              <Cloud className="w-3.5 h-3.5 text-blue-600" />
              <span>PDF Files</span>
            </button>
          )}

          {/* Quick Status Cycle */}
          {onQuickStatusChange && (
            <button
              type="button"
              onClick={() =>
                onQuickStatusChange(
                  activeRecord.video_id,
                  NEXT_STATUS[activeRecord.status || "Not Started"]
                )
              }
              className="flex items-center gap-1 px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 text-xs font-semibold transition-colors cursor-pointer shrink-0"
              title="Cycle to next status"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Next Status</span>
            </button>
          )}

          {/* Close HUD */}
          <button
            type="button"
            onClick={() => onSelectRecord(null)}
            className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer shrink-0 ml-auto"
            title="Deselect Node"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Bottom-Left HUD (Zoom, Center, Customization, Export & Fullscreen) */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 p-1.5 rounded-md bg-white/95 backdrop-blur-md border border-stone-200 shadow-md z-20">
        {/* Zoom In */}
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In (+)"
          aria-label="Zoom In"
          className="w-7 h-7 rounded hover:bg-stone-100 flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Zoom Percentage Dropdown Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowZoomMenu(!showZoomMenu)}
            title="Zoom Presets"
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-colors cursor-pointer ${
              showZoomMenu
                ? "bg-stone-900 text-white"
                : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
            }`}
          >
            {Math.round(zoom * 100)}%
          </button>

          {/* Zoom Presets Popover */}
          {showZoomMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-40 rounded-md bg-white border border-stone-200 shadow-xl p-1.5 z-30 space-y-1 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2 py-1 text-[10px] uppercase font-black text-stone-400 border-b border-stone-100">
                Zoom Presets
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs font-mono font-bold text-stone-700 p-0.5">
                {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setZoom(preset);
                      setShowZoomMenu(false);
                    }}
                    className={`py-1 px-1.5 rounded text-center transition-colors cursor-pointer ${
                      Math.abs(zoom - preset) < 0.05
                        ? "bg-stone-900 text-white"
                        : "hover:bg-stone-100"
                    }`}
                  >
                    {Math.round(preset * 100)}%
                  </button>
                ))}
              </div>
              <div className="pt-1 border-t border-stone-100 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    handleFitScreen();
                    setShowZoomMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                >
                  <Focus className="w-3.5 h-3.5 text-stone-500" />
                  <span>Fit Screen</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCenter();
                    setShowZoomMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-xs font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer"
                >
                  <Crosshair className="w-3.5 h-3.5 text-stone-500" />
                  <span>Center View</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Zoom Out */}
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out (-)"
          aria-label="Zoom Out"
          className="w-7 h-7 rounded hover:bg-stone-100 flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-stone-200 mx-0.5" />

        {/* Fit to Screen (F) */}
        <button
          type="button"
          onClick={handleFitScreen}
          title="Fit to Screen (F)"
          aria-label="Fit to Screen"
          className="w-7 h-7 rounded hover:bg-stone-100 flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
        >
          <Focus className="w-4 h-4" />
        </button>

        {/* Recenter Canvas (C) */}
        <button
          type="button"
          onClick={handleCenter}
          title="Center Canvas (C)"
          aria-label="Center Canvas"
          className="w-7 h-7 rounded hover:bg-stone-100 flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Reset Moved Tabs (R) */}
        {hasMovedTabs && Object.keys(nodeOffsets).length > 0 && (
          <>
            <div className="w-[1px] h-4 bg-stone-200 mx-0.5" />
            <button
              type="button"
              onClick={() => {
                setNodeOffsets({});
                setHasMovedTabs(false);
                setCopiedNotification("Reset tab positions to default auto-layout");
                setTimeout(() => setCopiedNotification(null), 2000);
              }}
              title="Reset moved tabs to default layout (R)"
              aria-label="Reset Tab Positions"
              className="flex items-center gap-1.5 px-2 h-7 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-colors cursor-pointer shadow-2xs animate-in fade-in"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#B81104]" />
              <span className="text-[10px] font-mono font-bold">Reset Tabs ({Object.keys(nodeOffsets).length})</span>
            </button>
          </>
        )}

        <div className="w-[1px] h-4 bg-stone-200 mx-0.5" />

        {/* Customization Settings Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            title="Customization & Styles (S)"
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
              showSettings ? "bg-stone-900 text-white" : "hover:bg-stone-100 text-stone-700"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Customization Drawer Popover */}
          {showSettings && (
            <div className="absolute bottom-full left-0 mb-2 w-72 rounded-md bg-white border border-stone-200 shadow-2xl p-3 z-30 space-y-3 animate-in fade-in zoom-in-95 duration-150 max-h-[520px] overflow-y-auto">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-100">
                <span className="text-xs font-black text-stone-900 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[#B81104]" />
                  <span>Map Customizer</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateCustomization(DEFAULT_CUSTOMIZATION)}
                    title="Reset Defaults"
                    className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Background Pattern Selector */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-stone-400">
                  Canvas Background
                </label>
                <div className="grid grid-cols-4 gap-1 text-[11px] font-bold">
                  {(["dots", "grid", "clean", "blueprint"] as BackgroundPattern[]).map((pat) => (
                    <button
                      key={pat}
                      type="button"
                      onClick={() => updateCustomization({ backgroundPattern: pat })}
                      className={`py-1 rounded capitalize transition-all cursor-pointer ${
                        customization.backgroundPattern === pat
                          ? "bg-stone-900 text-white shadow-2xs"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {pat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Edge Style Selector */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-stone-400">
                  Connector Style
                </label>
                <div className="grid grid-cols-3 gap-1 text-[11px] font-bold">
                  {(["curved", "step", "straight"] as EdgeStyle[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => updateCustomization({ edgeStyle: st })}
                      className={`py-1 rounded capitalize transition-all cursor-pointer ${
                        customization.edgeStyle === st
                          ? "bg-stone-900 text-white shadow-2xs"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme Palette Selector */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-stone-400">
                  Theme Palette
                </label>
                <div className="grid grid-cols-2 gap-1 text-[11px] font-bold">
                  {(["crimson", "emerald", "sapphire", "minimal", "blueprint"] as ColorTheme[]).map(
                    (th) => (
                      <button
                        key={th}
                        type="button"
                        onClick={() => updateCustomization({ theme: th })}
                        className={`py-1 px-2 rounded capitalize flex items-center gap-1.5 transition-all cursor-pointer ${
                          customization.theme === th
                            ? "bg-stone-900 text-white shadow-2xs"
                            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            th === "crimson"
                              ? "bg-red-600"
                              : th === "emerald"
                              ? "bg-emerald-600"
                              : th === "sapphire"
                              ? "bg-blue-600"
                              : th === "blueprint"
                              ? "bg-sky-400"
                              : "bg-stone-700"
                          }`}
                        />
                        <span>{th}</span>
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Density Mode */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-stone-400">Density</label>
                <div className="grid grid-cols-2 gap-1 text-[11px] font-bold">
                  {(["comfortable", "compact"] as LayoutDensity[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => updateCustomization({ density: d })}
                      className={`py-1 rounded capitalize transition-all cursor-pointer ${
                        customization.density === d
                          ? "bg-stone-900 text-white shadow-2xs"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-stone-400">
                  Filter by Status
                </label>
                <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
                  {(["ALL", "Done", "In Progress", "On Hold", "Not Started"] as StatusFilter[]).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => updateCustomization({ statusFilter: st })}
                        className={`py-1 px-1 rounded truncate text-center transition-all cursor-pointer ${
                          customization.statusFilter === st
                            ? "bg-[#B81104] text-white shadow-2xs"
                            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                        }`}
                      >
                        {st}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Element Toggles */}
              <div className="space-y-2 pt-1.5 border-t border-stone-100 text-xs font-semibold text-stone-700">
                <div className="flex items-center justify-between cursor-pointer">
                  <span>Segmented Progress Bars</span>
                  <Checkbox
                    size="sm"
                    checked={customization.showProgressBars}
                    onChange={(checked) => updateCustomization({ showProgressBars: checked })}
                  />
                </div>
                <div className="flex items-center justify-between cursor-pointer">
                  <span>Status Badges</span>
                  <Checkbox
                    size="sm"
                    checked={customization.showStatusBadges}
                    onChange={(checked) => updateCustomization({ showStatusBadges: checked })}
                  />
                </div>
                <div className="flex items-center justify-between cursor-pointer">
                  <span>Connection Ports</span>
                  <Checkbox
                    size="sm"
                    checked={customization.showPorts}
                    onChange={(checked) => updateCustomization({ showPorts: checked })}
                  />
                </div>
                <div className="flex items-center justify-between cursor-pointer">
                  <span>Glowing Active Trails</span>
                  <Checkbox
                    size="sm"
                    checked={customization.showGlowTrails}
                    onChange={(checked) => updateCustomization({ showGlowTrails: checked })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Multi-Format Export Menu */}
        <DropdownMenu open={showExportMenu} onOpenChange={setShowExportMenu}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Export & Share Mind Map"
              className="w-7 h-7 rounded hover:bg-stone-100 flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" width="w-52">
            <DropdownMenuLabel>Export Mind Map</DropdownMenuLabel>
            <DropdownMenuItem onClick={handleExportPng} shortcut="2x PNG">
              <FileImage className="w-3.5 h-3.5 mr-2 text-stone-500" />
              High-Res Image
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportSvg} shortcut="Vector">
              <FileCode className="w-3.5 h-3.5 mr-2 text-stone-500" />
              Vector Graphic (SVG)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportJson} shortcut="JSON">
              <FileText className="w-3.5 h-3.5 mr-2 text-stone-500" />
              Hierarchy Tree
            </DropdownMenuItem>
            <div className="h-[1px] bg-stone-100 my-1" />
            <DropdownMenuItem onClick={handleCopyMarkdown} shortcut="Outline">
              <Copy className="w-3.5 h-3.5 mr-2 text-stone-500" />
              Copy Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadMarkdown} shortcut=".md">
              <Download className="w-3.5 h-3.5 mr-2 text-stone-500" />
              Download Syllabus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Fullscreen Toggle */}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
          className="w-7 h-7 rounded hover:bg-stone-100 flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Floating Status Legend (Top-Right) */}
      <div className="absolute top-3.5 right-4 flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-white/95 backdrop-blur-md border border-stone-200 text-[11px] font-bold text-stone-600 shadow-xs z-20">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Done
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> In Progress
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> On Hold
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-stone-300" /> Not Started
        </span>
      </div>

      {/* Empty State Overlay */}
      {records.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none z-30">
          <div className="max-w-md p-6 rounded-md bg-white/95 backdrop-blur-md border border-stone-200 shadow-xl text-center space-y-3 pointer-events-auto">
            <div className="w-12 h-12 rounded-md bg-stone-100 text-[#B81104] border border-stone-200 flex items-center justify-center mx-auto shadow-2xs">
              <Layers className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-extrabold text-stone-900">Curriculum Workspace Empty</h4>
              <p className="text-xs text-stone-500 leading-relaxed font-medium">
                No curriculum records exist yet. Import your curriculum spreadsheet via CSV/Excel or sync the
                master skeleton to build your interactive mind map.
              </p>
            </div>

            {onSyncMasterSkeleton && (
              <button
                type="button"
                onClick={async () => {
                  setIsSyncingMaster(true);
                  try {
                    await onSyncMasterSkeleton();
                  } finally {
                    setIsSyncingMaster(false);
                  }
                }}
                disabled={isSyncingMaster}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSyncingMaster ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                )}
                <span>Sync Master Skeleton (865 Records)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
