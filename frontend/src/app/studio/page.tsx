"use client";

import React, { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Session, User } from "@supabase/supabase-js";
import { ALL_GRADES, getGrade } from "../../lib/curriculum-data";
import { createClient } from "../../lib/supabase/client";
import { useAssessment } from "../../lib/store";
import {
  generateAssessment,
  generateMergedAssessmentPaper,
  fetchCurriculumOverview,
  loadCurriculumChapter,
  CurriculumOverviewResponse,
  UploadResponse,
  extractErrorMessage,
} from "../../lib/api";
import { sortChaptersNumerically } from "../../lib/curriculum-api";
import { useCurriculumWorkspace } from "../../features/curriculum/hooks/useCurriculumWorkspace";
import {
  StudioView,
  GeneratedQuestion,
  GradeDefinition,
} from "../../features/studio/types";
import { CloudinaryAsset, ResourceMetadata } from "../../types";
import { StudioSidebar } from "../../features/studio/components/StudioSidebar";
import { StudioHeader } from "../../features/studio/components/StudioHeader";
import { CurriculumView } from "../../features/studio/components/CurriculumView";
import { AssessmentStudio } from "../../features/studio/components/AssessmentStudio";
import { StudentTracker } from "../../features/studio/components/StudentTracker";

const UploadModal = dynamic(
  () => import("../../features/studio/components/UploadModal").then((mod) => mod.UploadModal),
  { ssr: false }
);

const CurriculumPdfManager = dynamic(
  () => import("../../features/curriculum/components/CurriculumPdfManager").then((mod) => mod.CurriculumPdfManager),
  { ssr: false }
);

const STORAGE_KEY_GRADE = "edinno_last_studio_grade";
const STORAGE_KEY_VIEW = "edinno_last_studio_view";

const emptySubscribe = () => () => {};

function getInitialGrade(): number {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const gradeParam = params.get("grade");
    if (gradeParam && !isNaN(parseInt(gradeParam, 10))) {
      const g = parseInt(gradeParam, 10);
      if (ALL_GRADES.includes(g)) return g;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY_GRADE);
      if (saved && !isNaN(parseInt(saved, 10))) {
        const g = parseInt(saved, 10);
        if (ALL_GRADES.includes(g)) return g;
      }
    } catch {
      // localStorage restricted
    }
  }
  return 6;
}

function getInitialView(): StudioView {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const tabParam = (params.get("view") || params.get("tab")) as StudioView | null;
    if (tabParam && ["curriculum", "generate", "tracker"].includes(tabParam)) {
      return tabParam;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY_VIEW) as StudioView | null;
      if (saved && ["curriculum", "generate", "tracker"].includes(saved)) {
        return saved;
      }
    } catch {
      // localStorage restricted
    }
  }
  return "curriculum";
}

export default function StudioDashboard() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { setAssessmentPayload, extractedImages, extractedResources, setExtractedData } = useAssessment();

  // Pure React 18/19 hydration guard with zero setState and zero SSR mismatch
  const isHydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);

  // User auth state
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // User-selected grade/view (overrides default stored values)
  const [userGradeId, setUserGradeId] = useState<number | null>(null);
  const [userView, setUserView] = useState<StudioView | null>(null);

  const activeGradeId = userGradeId ?? (isHydrated ? getInitialGrade() : 6);
  const activeView = userView ?? (isHydrated ? getInitialView() : "curriculum");

  // Single shared curriculum workspace for both Curriculum View and Assessment Studio
  const curriculumWorkspace = useCurriculumWorkspace(activeGradeId);

  const curriculumChapters = useMemo(() => {
    const chs = new Set<string>();
    curriculumWorkspace.records.forEach((r) => {
      if (r.chapter && r.chapter.trim()) {
        if (!activeGradeId || r.grade === activeGradeId) {
          chs.add(r.chapter.trim());
        }
      }
    });
    return Array.from(chs).sort(sortChaptersNumerically);
  }, [curriculumWorkspace.records, activeGradeId]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const activeGrade: GradeDefinition = useMemo(() => {
    return getGrade(activeGradeId);
  }, [activeGradeId]);

  // Dynamic chapter materials fetcher integrating Curriculum Engine with Assessment formation
  const [isFetchingChapter, setIsFetchingChapter] = useState<boolean>(false);
  const handleFetchChapterMaterials = useCallback(
    async (chapterName?: string): Promise<UploadResponse | null> => {
      setIsFetchingChapter(true);
      try {
        const resp = await loadCurriculumChapter(activeGradeId, chapterName);
        setExtractedData(
          resp.resources,
          resp.metadata,
          resp.suggested_chapter_title || chapterName || activeGrade.name
        );
        return resp;
      } catch (err: unknown) {
        throw new Error(extractErrorMessage(err, `Failed to load materials for Grade ${activeGradeId}`));
      } finally {
        setIsFetchingChapter(false);
      }
    },
    [activeGradeId, activeGrade.name, setExtractedData]
  );

  // Synchronize last used grade and view to localStorage and URL query params
  useEffect(() => {
    if (isHydrated && typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_GRADE, String(activeGradeId));
        localStorage.setItem(STORAGE_KEY_VIEW, activeView);
        const url = new URL(window.location.href);
        url.searchParams.set("grade", String(activeGradeId));
        url.searchParams.set("tab", activeView);
        window.history.replaceState(null, "", url.toString());
      } catch {
        // localStorage restricted in private mode
      }
    }
  }, [activeGradeId, activeView, isHydrated]);

  // Curriculum state from real backend API
  const [curriculum, setCurriculum] = useState<CurriculumOverviewResponse | null>(null);
  const [loadingGradeId, setLoadingGradeId] = useState<number | null>(activeGradeId);
  const [curriculumError, setCurriculumError] = useState<string | null>(null);
  const isLoadingCurriculum = loadingGradeId === activeGradeId;

  // Assessment generation state
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [questionFormat, setQuestionFormat] = useState<string>("mixed");
  const [difficulty, setDifficulty] = useState<"foundation" | "standard" | "master">("standard");
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [requireSafetyQuestions, setRequireSafetyQuestions] = useState<boolean>(true);
  const [selectedProvider, setSelectedProvider] = useState<string>("gemini");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("upload") === "true";
    }
    return false;
  });
  const [isPdfStorageOpen, setIsPdfStorageOpen] = useState<boolean>(false);
  const [pdfStorageGrade, setPdfStorageGrade] = useState<number>(activeGradeId);
  const [selectedPdfAssets, setSelectedPdfAssets] = useState<CloudinaryAsset[]>([]);

  const handleOpenPdfStorage = (grade?: number) => {
    if (grade) setPdfStorageGrade(grade);
    setIsPdfStorageOpen(true);
  };

  const handleSelectAssetForAssessment = (
    assetOrAssets: CloudinaryAsset | CloudinaryAsset[]
  ) => {
    const assets = Array.isArray(assetOrAssets) ? assetOrAssets : [assetOrAssets];
    setSelectedPdfAssets(assets);

    if (assets.length > 0) {
      const resources: Record<string, string> = {};
      const metadata: Record<string, ResourceMetadata> = {};

      for (const asset of assets) {
        const key = `${asset.category}-${asset.title}`;
        const previewTxt =
          asset.metadata?.preview_text || `Curriculum Module: ${asset.title}`;
        const specText =
          `=== CLOUDINARY CURRICULUM MODULE: ${asset.title} ===\n` +
          `Grade: Grade ${asset.grade}\n` +
          `Chapter: ${asset.chapter}\n` +
          `Category: ${asset.category}\n` +
          `Cloudinary Delivery URL: ${asset.secure_url}\n\n` +
          `Curriculum Specification & Objectives:\n` +
          `${previewTxt}\n`;

        resources[key] = specText;
        metadata[key] = {
          name: asset.title,
          page_count: asset.metadata?.page_count || 1,
          char_count: specText.length,
          preview: specText.slice(0, 200),
          category: asset.category.toLowerCase(),
          image_count: 0,
        };
      }

      const gNum = assets[0]?.grade || activeGradeId;
      const allSameGrade = assets.every((a) => a.grade === gNum);
      const chapterLabel =
        assets.length === 1
          ? assets[0].chapter || `Grade ${assets[0].grade} Assessment`
          : allSameGrade
          ? `Grade ${gNum} Curriculum (${assets.length} Modules)`
          : `Curriculum Assessment (${assets.length} Modules)`;

      setExtractedData(resources, metadata, chapterLabel);
    }

    handleViewChange("generate");
  };

  const handleRemoveSinglePdfAsset = (assetId: string) => {
    setSelectedPdfAssets((prev) =>
      prev.filter((a) => a.id !== assetId && a.public_id !== assetId)
    );
  };

  const handleClearActivePdfAssets = () => {
    setSelectedPdfAssets([]);
  };

  // Auth user state - restored immediately on refresh via getSession() + verified with getUser()
  useEffect(() => {
    supabase.auth.getSession().then((res: { data: { session: Session | null } }) => {
      if (res.data.session?.user?.email) {
        setUserEmail(res.data.session.user.email);
      }
    });

    supabase.auth.getUser().then((res: { data: { user: User | null } }) => {
      if (res.data.user?.email) {
        setUserEmail(res.data.user.email);
      }
    });
  }, [supabase]);

  // Real data fetching for curriculum
  useEffect(() => {
    let isCancelled = false;

    fetchCurriculumOverview(activeGradeId)
      .then((data) => {
        if (!isCancelled) {
          setCurriculum(data);
          if (data.topics && data.topics.length > 0) {
            setSelectedTopicIds(data.topics.map((t) => t.id));
          } else {
            setSelectedTopicIds([]);
          }
          setCurriculumError(null);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          setCurriculumError(extractErrorMessage(err, `Failed to load Grade ${activeGradeId} curriculum`));
          setCurriculum(null);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingGradeId(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeGradeId]);

  // Real data fetching for student safety records
  const handleGradeChange = (gradeId: number) => {
    setUserGradeId(gradeId);
    setLoadingGradeId(gradeId);
    setCurriculumError(null);
    setGeneratedQuestions([]);
    setGenerateError(null);
    setIsMobileMenuOpen(false);
  };

  const handleViewChange = (view: StudioView) => {
    setUserView(view);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleToggleTopic = (topicId: string, checked: boolean) => {
    if (checked) {
      setSelectedTopicIds((prev) => [...prev, topicId]);
    } else {
      setSelectedTopicIds((prev) => prev.filter((id) => id !== topicId));
    }
  };

  // Real backend-driven assessment generation
  const handleGenerateAssessment = async (overrideParams?: {
    provider?: string;
    blueprint?: string;
    targetScope?: string;
  }) => {
    setIsGenerating(true);
    setGenerateError(null);

    const providerToUse = overrideParams?.provider || selectedProvider || "gemini";
    const formatToUse = overrideParams?.blueprint || questionFormat;
    const targetScopeToUse = overrideParams?.targetScope || "ALL";

    try {
      let currentResources = extractedResources;

      // Extract requested chapter name if scope is chapter:*
      let targetChapter: string | undefined = undefined;
      if (targetScopeToUse.startsWith("chapter:")) {
        targetChapter = targetScopeToUse.replace(/^chapter:/, "");
      }

      // Check whether resources are already in memory for this scope
      const hasChapterInMemory =
        currentResources &&
        Object.keys(currentResources).length > 0 &&
        (!targetChapter ||
          Object.keys(currentResources).some((k) => {
            const sc = targetChapter!.toLowerCase();
            return (
              k.toLowerCase().includes(sc) ||
              (currentResources[k] && currentResources[k].toLowerCase().includes(sc))
            );
          }));

      // If resources are empty in memory, or if the selected chapter isn't loaded yet:
      // automatically fetch chapter materials/synthesized records from the backend!
      if (!currentResources || Object.keys(currentResources).length === 0 || !hasChapterInMemory) {
        try {
          const loaded = await loadCurriculumChapter(activeGradeId, targetChapter);
          setExtractedData(
            loaded.resources,
            loaded.metadata,
            loaded.suggested_chapter_title || targetChapter || activeGrade.name
          );
          currentResources = loaded.resources;
        } catch {
          // If specific chapter fetch didn't locate PDFs, fallback to full grade materials
          if (targetChapter) {
            try {
              const fallbackLoaded = await loadCurriculumChapter(activeGradeId);
              setExtractedData(
                fallbackLoaded.resources,
                fallbackLoaded.metadata,
                fallbackLoaded.suggested_chapter_title || activeGrade.name
              );
              currentResources = fallbackLoaded.resources;
            } catch {
              // will report below
            }
          }
        }
      }

      // 1. Build chapterContent from authentic OCR text in extractedResources
      let chapterContent = "";
      if (currentResources && Object.keys(currentResources).length > 0) {
        if (targetScopeToUse === "ALL") {
          chapterContent = Object.entries(currentResources)
            .map(([k, text]) => `=== MODULE: ${k} ===\n${text}`)
            .join("\n\n");
        } else if (targetScopeToUse.startsWith("chapter:")) {
          const chName = targetScopeToUse.replace(/^chapter:/, "").toLowerCase();
          const matched = Object.entries(currentResources).filter(([k, text]) => {
            return k.toLowerCase().includes(chName) || text.toLowerCase().includes(chName);
          });
          if (matched.length > 0) {
            chapterContent = matched.map(([k, text]) => `=== MODULE: ${k} ===\n${text}`).join("\n\n");
          } else {
            chapterContent = Object.entries(currentResources)
              .map(([k, text]) => `=== MODULE: ${k} ===\n${text}`)
              .join("\n\n");
          }
        } else if (targetScopeToUse.startsWith("category:")) {
          const cat = targetScopeToUse.replace(/^category:/, "").toLowerCase();
          const matched = Object.entries(currentResources).filter(([k, text]) => {
            return k.toLowerCase().includes(cat) || text.toLowerCase().includes(cat);
          });
          if (matched.length > 0) {
            chapterContent = matched.map(([k, text]) => `=== MODULE: ${k} ===\n${text}`).join("\n\n");
          } else {
            chapterContent = Object.entries(currentResources)
              .map(([k, text]) => `=== MODULE: ${k} ===\n${text}`)
              .join("\n\n");
          }
        } else if (targetScopeToUse.startsWith("doc:")) {
          const docKey = targetScopeToUse.replace(/^doc:/, "");
          if (currentResources[docKey]) {
            chapterContent = `=== MODULE: ${docKey} ===\n${currentResources[docKey]}`;
          } else {
            chapterContent = Object.entries(currentResources)
              .map(([k, text]) => `=== MODULE: ${k} ===\n${text}`)
              .join("\n\n");
          }
        } else if (currentResources[targetScopeToUse]) {
          chapterContent = `=== MODULE: ${targetScopeToUse} ===\n${currentResources[targetScopeToUse]}`;
        } else {
          chapterContent = Object.entries(currentResources)
            .map(([k, text]) => `=== MODULE: ${k} ===\n${text}`)
            .join("\n\n");
        }
      }

      if (!chapterContent.trim()) {
        throw new Error(
          `No curriculum documents or records found for ${activeGrade.name}. Please upload course PDF materials in Ingest or add curriculum records in Curriculum View.`
        );
      }

      let response;
      if (formatToUse === "merged_conceptual") {
        response = await generateMergedAssessmentPaper({
          chapterContent,
          questionCount,
          difficulty,
          provider: providerToUse,
          availableImages: extractedImages?.slice(0, 10),
        });
      } else {
        response = await generateAssessment(
          chapterContent,
          formatToUse,
          questionCount,
          difficulty,
          providerToUse,
          undefined,
          undefined,
          undefined,
          extractedImages?.slice(0, 10)
        );
      }

      if (response && response.questions && response.questions.length > 0) {
        setAssessmentPayload({
          assessment_type: formatToUse,
          chapter_name: response.chapter_name || curriculum?.title || `${activeGrade.name} Assessment`,
          difficulty,
          provider: response.metadata?.provider || providerToUse,
          model: response.metadata?.model || "Standard",
          questions: response.questions,
        });

        const mapped: GeneratedQuestion[] = response.questions.map((q, idx) => {
          let opts: string[] = [];
          if (Array.isArray(q.options)) {
            opts = q.options;
          } else if (typeof q.options === "object" && q.options !== null) {
            opts = Object.entries(q.options).map(([k, v]) => `${k}) ${v}`);
          }

          let correct = q.answer || "";
          if (correct && opts.length > 0) {
            const matchedOpt = opts.find((o) => o.startsWith(`${correct})`));
            if (matchedOpt) correct = matchedOpt;
          }

          return {
            id: String(q.id || `q-${idx + 1}-${Date.now()}`),
            type: (q.type as "mcq" | "scenario" | "matching" | "true_false") || "mcq",
            difficulty,
            question: q.question,
            hardwareFocus: q.category || activeGrade.name,
            options: opts,
            correctAnswer: correct,
            explanation: q.explanation || "Curriculum hardware standard.",
            isSafetyGate: requireSafetyQuestions && idx < 2,
          };
        });
        setGeneratedQuestions(mapped);
      } else {
        setGenerateError(
          "The AI assessment engine returned no questions. Please verify selected topics and retry."
        );
      }
    } catch (err: unknown) {
      setGenerateError(
        extractErrorMessage(
          err,
          "Failed to synthesize questions. Check backend connectivity or select fewer topics."
        )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#B81104] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1C1917] flex flex-col md:flex-row font-sans selection:bg-[#B81104] selection:text-[#FFFACD]">
      {/* 1. Floating Pill Sidebar */}
      <StudioSidebar
        activeGradeId={activeGradeId}
        onSelectGrade={handleGradeChange}
        activeView={activeView}
        onSelectView={handleViewChange}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
        userEmail={userEmail}
        onSignOut={handleSignOut}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
        onOpenPdfStorage={() => setIsPdfStorageOpen(true)}
      />

      {/* 2. Main Studio Area */}
      <main
        className={`flex-1 transition-all duration-300 p-4 sm:p-6 lg:p-8 xl:p-10 w-full min-w-0 ${
          isSidebarCollapsed ? "md:ml-24" : "md:ml-80"
        }`}
      >
        <div className="max-w-[1800px] mx-auto w-full space-y-6">
          {/* Top Control Bar */}
          <StudioHeader
            activeView={activeView}
            onSelectView={handleViewChange}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />

          {/* View 1: Curriculum Explorer */}
          {activeView === "curriculum" && (
            <CurriculumView
              activeGradeId={activeGrade.id}
              activeGradeName={activeGrade.name}
              curriculum={curriculum}
              isLoading={isLoadingCurriculum}
              error={curriculumError}
              workspaceProp={curriculumWorkspace}
              onRetry={() => {
                setLoadingGradeId(activeGradeId);
                setCurriculumError(null);
              }}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
              onSelectTopicForQuiz={(topicId) => {
                setSelectedTopicIds([topicId]);
                handleViewChange("generate");
              }}
              onOpenPdfStorage={handleOpenPdfStorage}
              onSelectAssetForAssessment={handleSelectAssetForAssessment}
            />
          )}

          {/* View 2: Assessment Generation Studio */}
          {activeView === "generate" && (
            <AssessmentStudio
              activeGrade={activeGrade}
              availableTopics={curriculum?.topics || []}
              curriculumRecords={curriculumWorkspace.records}
              curriculumChapters={curriculumChapters}
              gradeTitle={curriculum?.title}
              staged={curriculum?.staged}
              selectedTopicIds={selectedTopicIds}
              onToggleTopic={handleToggleTopic}
              questionFormat={questionFormat}
              onChangeQuestionFormat={setQuestionFormat}
              difficulty={difficulty}
              onChangeDifficulty={setDifficulty}
              questionCount={questionCount}
              onChangeQuestionCount={setQuestionCount}
              requireSafetyQuestions={requireSafetyQuestions}
              onToggleRequireSafety={setRequireSafetyQuestions}
              isGenerating={isGenerating}
              onGenerate={handleGenerateAssessment}
              generatedQuestions={generatedQuestions}
              errorMsg={generateError}
              selectedProvider={selectedProvider}
              onSelectProvider={setSelectedProvider}
              onFetchChapterMaterials={handleFetchChapterMaterials}
              isFetchingMaterials={isFetchingChapter}
              onOpenPdfStorage={() => setIsPdfStorageOpen(true)}
              activePdfAssets={selectedPdfAssets}
              activePdfAsset={selectedPdfAssets[0] || null}
              onClearActivePdfAsset={handleClearActivePdfAssets}
              onClearActivePdfAssets={handleClearActivePdfAssets}
              onRemoveSinglePdfAsset={handleRemoveSinglePdfAsset}
            />
          )}

          {/* View 3: Student Tracker */}
          {activeView === "tracker" && (
            <StudentTracker activeGrade={activeGrade} />
          )}
        </div>
      </main>

      {/* 3. PDF Ingestion Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        activeGrade={activeGrade}
        availableChapters={curriculumChapters}
        records={curriculumWorkspace.records}
        onUploadSuccess={() => {
          curriculumWorkspace.refresh();
        }}
        onOpenPdfStorage={() => {
          setIsUploadModalOpen(false);
          setIsPdfStorageOpen(true);
        }}
      />

      {/* 4. Cloudinary Curriculum PDF Storage & Asset Manager */}
      <CurriculumPdfManager
        isOpen={isPdfStorageOpen}
        onClose={() => setIsPdfStorageOpen(false)}
        initialGrade={pdfStorageGrade || activeGradeId}
        availableChapters={curriculumChapters}
        records={curriculumWorkspace.records}
        onSelectForAssessment={handleSelectAssetForAssessment}
      />
    </div>
  );
}
