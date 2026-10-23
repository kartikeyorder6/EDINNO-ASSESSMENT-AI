"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "../../lib/store";
import { ResourceCategory } from "../../types";
import {
  FileText,
  Layers,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Copy,
  Check,
  BookOpen,
  FlaskConical,
  Rocket,
  Paperclip,
  CheckCircle2,
  FileSpreadsheet,
  Edit2,
  SlidersHorizontal,
  Zap,
  Ban,
} from "lucide-react";

const CATEGORY_STYLES: Record<
  ResourceCategory,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeBg: string;
    badgeText: string;
    borderColor: string;
    lightBg: string;
  }
> = {
  topic: {
    title: "Topics",
    icon: BookOpen,
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    borderColor: "border-blue-200",
    lightBg: "bg-blue-50/40",
  },
  activity: {
    title: "Activities",
    icon: FlaskConical,
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
    borderColor: "border-emerald-200",
    lightBg: "bg-emerald-50/40",
  },
  project: {
    title: "Projects",
    icon: Rocket,
    badgeBg: "bg-purple-100",
    badgeText: "text-purple-800",
    borderColor: "border-purple-200",
    lightBg: "bg-purple-50/40",
  },
  resource: {
    title: "Resources Extra",
    icon: Paperclip,
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-800",
    borderColor: "border-slate-200",
    lightBg: "bg-slate-50/40",
  },
};

function resolveCategory(key: string, metaCat?: string): ResourceCategory {
  if (metaCat && metaCat in CATEGORY_STYLES) {
    return metaCat as ResourceCategory;
  }
  const k = key.toLowerCase();
  if (k.includes("activit") || k.includes("lab") || k.includes("experiment") || k.includes("task")) {
    return "activity";
  }
  if (k.includes("project") || /p-\d+/i.test(k) || k.includes("capstone") || k.includes("tech")) {
    return "project";
  }
  if (k.includes("topic") || k.includes("module") || k.includes("lesson") || k.includes("unit")) {
    return "topic";
  }
  return "resource";
}

export default function MergePage() {
  const router = useRouter();
  const { extractedResources, resourceMetadata, activeChapterName, setExtractedData } = useAssessment();

  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>("all");
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const cleanChapterStr = (str: string) => (str || "").replace(/\s*[\(\[][\s\S]*?[\)\]]/g, "").trim();
  const [editedTitle, setEditedTitle] = useState<string>(cleanChapterStr(activeChapterName));

  const entries = Object.entries(extractedResources);
  const totalDocs = entries.length;

  const totalChars = entries.reduce((acc, [_, text]) => acc + text.length, 0);
  const estimatedWords = Math.round(totalChars / 5.5);
  const estimatedTokens = Math.round(totalChars / 4.0);

  // Group entries by category
  const categorizedEntries = entries.map(([key, text]) => {
    const meta = resourceMetadata[key];
    const category = resolveCategory(key, meta?.category);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const tokenCount = Math.round(text.length / 4.0);

    return {
      key,
      text,
      meta,
      category,
      wordCount,
      tokenCount,
      charCount: text.length,
      pageCount: meta?.page_count || 1,
      fileName: meta?.name || `${key}.pdf`,
    };
  });

  const categoryCounts: Record<ResourceCategory, number> = {
    topic: categorizedEntries.filter((e) => e.category === "topic").length,
    activity: categorizedEntries.filter((e) => e.category === "activity").length,
    project: categorizedEntries.filter((e) => e.category === "project").length,
    resource: categorizedEntries.filter((e) => e.category === "resource").length,
  };

  const categoryWords: Record<ResourceCategory, number> = {
    topic: categorizedEntries
      .filter((e) => e.category === "topic")
      .reduce((sum, e) => sum + e.wordCount, 0),
    activity: categorizedEntries
      .filter((e) => e.category === "activity")
      .reduce((sum, e) => sum + e.wordCount, 0),
    project: categorizedEntries
      .filter((e) => e.category === "project")
      .reduce((sum, e) => sum + e.wordCount, 0),
    resource: categorizedEntries
      .filter((e) => e.category === "resource")
      .reduce((sum, e) => sum + e.wordCount, 0),
  };

  const filteredEntries = categorizedEntries.filter((doc) => {
    // Filter by tab
    if (selectedCategoryTab !== "all" && doc.category !== selectedCategoryTab) {
      return false;
    }
    // Filter by search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      doc.key.toLowerCase().includes(q) ||
      doc.fileName.toLowerCase().includes(q) ||
      doc.text.toLowerCase().includes(q)
    );
  });

  const toggleExpand = (k: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [k]: !prev[k],
    }));
  };

  const expandAll = () => {
    const allExp: Record<string, boolean> = {};
    filteredEntries.forEach((e) => {
      allExp[e.key] = true;
    });
    setExpandedKeys(allExp);
  };

  const collapseAll = () => {
    setExpandedKeys({});
  };

  const copyContent = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveTitle = () => {
    const trimmed = editedTitle.trim() || activeChapterName || "Curriculum Chapter";
    setExtractedData(extractedResources, resourceMetadata, trimmed);
    setIsEditingTitle(false);
  };

  const categories: ResourceCategory[] = ["topic", "activity", "project", "resource"];

  return (
    <div className="max-w-7xl xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Hero Header */}
      <div className="bg-[#FFFFFF] border border-[#EAE5D9] rounded-2xl p-6 sm:p-8 shadow-xs mb-8 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 mb-3">
              <Layers className="w-3.5 h-3.5" />
              <span>Step 2 of 4 • Curriculum Knowledge Corpus</span>
            </div>

            {/* Editable Chapter Title */}
            {isEditingTitle ? (
              <div className="flex items-center gap-2 mt-1 mb-2">
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="text-xl sm:text-2xl font-extrabold text-slate-900 border border-blue-400 rounded-xl px-3 py-1.5 bg-blue-50/30 focus:outline-none focus:bg-white focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-1 mb-1 group">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {cleanChapterStr(activeChapterName) || "Curriculum Chapter"}
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setEditedTitle(cleanChapterStr(activeChapterName));
                    setIsEditingTitle(true);
                  }}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                  title="Rename Chapter Title"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}

            <p className="text-sm text-slate-500 max-w-2xl mt-1.5 leading-relaxed">
              Verified curriculum modules individually extracted with PyMuPDF. Review text, circuit pinouts,
              and formulas itemized across Topics, Activities, Projects, and Extra Resources.
            </p>
          </div>

          {/* Aggregate Stats Capsule */}
          <div className="flex items-center gap-4 bg-[#FBF9F5] border border-[#EAE5D9] p-3.5 rounded-xl shrink-0">
            <div className="text-center px-3 border-r border-[#EAE5D9]">
              <div className="text-xl font-bold text-blue-600">{totalDocs}</div>
              <div className="text-[11px] font-medium text-slate-400">Total Files</div>
            </div>
            <div className="text-center px-3 border-r border-[#EAE5D9]">
              <div className="text-xl font-bold text-slate-900">{estimatedWords.toLocaleString()}</div>
              <div className="text-[11px] font-medium text-slate-400">Total Words</div>
            </div>
            <div className="text-center px-3">
              <div className="text-xl font-bold text-emerald-600">~{estimatedTokens.toLocaleString()}</div>
              <div className="text-[11px] font-medium text-slate-400">Context Tokens</div>
            </div>
          </div>
        </div>

        {/* 4-Category Live Breakdown Grid (Bigger & Interactive) */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6 mt-6 border-t border-[#EAE5D9]">
          {categories.map((catKey) => {
            const style = CATEGORY_STYLES[catKey];
            const Icon = style.icon;
            const count = categoryCounts[catKey];
            const words = categoryWords[catKey];
            const isActive = selectedCategoryTab === catKey;

            return (
              <button
                key={catKey}
                type="button"
                onClick={() =>
                  setSelectedCategoryTab(selectedCategoryTab === catKey ? "all" : catKey)
                }
                className={`p-4 sm:p-5 rounded-2xl border text-left transition-all duration-200 cursor-pointer card-interactive ${
                  isActive
                    ? "border-blue-600 bg-blue-50/60 shadow-md ring-2 ring-blue-500 scale-[1.02]"
                    : `${style.borderColor} ${style.lightBg} hover:shadow-xs`
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-2xs ${style.badgeBg} ${style.badgeText}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-xs font-black px-2.5 py-1 rounded-full ${
                      count > 0 ? "bg-slate-900 text-white shadow-2xs" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {count} {count === 1 ? "File" : "Files"}
                  </span>
                </div>
                <div className="font-extrabold text-slate-900 text-sm truncate">{style.title}</div>
                <div className="text-xs text-slate-400 mt-1 font-medium">
                  {words.toLocaleString()} words extracted
                </div>
              </button>
            );
          })}
        </div>

        {/* Filter and Search Controls */}
        {totalDocs > 0 && (
          <div className="pt-6 mt-6 border-t border-[#EAE5D9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Category tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryTab("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedCategoryTab === "all"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-[#FBF9F5] border border-[#EAE5D9] text-slate-600 hover:bg-white"
                }`}
              >
                All Documents ({totalDocs})
              </button>

              {categories.map((catKey) => {
                const count = categoryCounts[catKey];
                const style = CATEGORY_STYLES[catKey];
                const isActive = selectedCategoryTab === catKey;

                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setSelectedCategoryTab(catKey)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-[#FBF9F5] border border-[#EAE5D9] text-slate-600 hover:bg-white"
                    }`}
                  >
                    <span>{style.title}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Expand / Collapse & Search */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search extracted content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs font-medium pl-8 pr-3 py-1.5 bg-[#FBF9F5] border border-[#EAE5D9] rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              <button
                type="button"
                onClick={expandAll}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
              >
                Collapse All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Empty State Safeguard */}
      {totalDocs === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#EAE5D9] rounded-2xl p-12 text-center shadow-xs">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 mb-1">
            No Curriculum Documents Loaded
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
            Upload your course PDFs in Step 1 to extract text and prepare curriculum content.
          </p>
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-xs cursor-pointer transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go to Step 1 & Upload PDFs</span>
            </button>
          </div>
        </div>
      ) : (
        /* Individual Documents Details Section */
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-800">
              Individual Curriculum Modules ({filteredEntries.length} Shown)
            </h2>
            <span className="text-xs text-slate-400">
              {filteredEntries.reduce((acc, d) => acc + d.wordCount, 0).toLocaleString()} words •{" "}
              {filteredEntries.reduce((acc, d) => acc + d.pageCount, 0)} total pages
            </span>
          </div>

          {filteredEntries.map((doc) => {
            const isExpanded = !!expandedKeys[doc.key];
            const isCopied = copiedKey === doc.key;
            const style = CATEGORY_STYLES[doc.category];
            const Icon = style.icon;

            return (
              <div
                key={doc.key}
                className="bg-[#FFFFFF] border border-[#EAE5D9] rounded-2xl overflow-hidden shadow-xs hover:border-blue-300 transition-all"
              >
                {/* Header row with full document details */}
                <div className="w-full p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div
                    onClick={() => toggleExpand(doc.key)}
                    className="flex items-start sm:items-center gap-3.5 cursor-pointer flex-1 min-w-0"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${style.badgeBg} ${style.badgeText}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="truncate flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${style.borderColor} ${style.badgeBg} ${style.badgeText}`}
                        >
                          {style.title}
                        </span>
                        <h3
                          className="font-bold text-slate-900 text-sm sm:text-base truncate"
                          title={doc.key}
                        >
                          {doc.key}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span className="font-mono text-[11px] text-slate-500 truncate max-w-[220px]" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        <span>•</span>
                        <span>{doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"}</span>
                        <span>•</span>
                        <span className="font-semibold text-slate-700">
                          {doc.wordCount.toLocaleString()} words
                        </span>
                        <span>•</span>
                        <span>{doc.charCount.toLocaleString()} chars</span>
                        <span>•</span>
                        <span className="text-emerald-600 font-semibold">
                          ~{doc.tokenCount.toLocaleString()} tokens
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Copy & Inspect Toggle */}
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => copyContent(doc.key, doc.text)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
                      title="Copy raw extracted text"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpand(doc.key)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isExpanded
                          ? "bg-slate-900 text-white shadow-xs"
                          : "border border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100 hover:border-blue-300"
                      }`}
                    >
                      <span>{isExpanded ? "Collapse" : "Inspect Content"}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Document preview snippet if collapsed */}
                {!isExpanded && doc.meta?.preview && (
                  <div className="px-5 pb-4 pt-0">
                    <p className="text-xs text-slate-400 line-clamp-1 italic">
                      "{doc.meta.preview}"
                    </p>
                  </div>
                )}

                {/* Full Extracted Text Drawer if expanded */}
                {isExpanded && (
                  <div className="border-t border-[#EAE5D9] bg-[#FBF9F5]">
                    <div className="px-5 py-2.5 bg-slate-100/70 border-b border-[#EAE5D9] flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                      <span>PyMuPDF Extracted Curriculum Text ({doc.charCount.toLocaleString()} characters)</span>
                      <span>UTF-8 Monospace View</span>
                    </div>
                    <div className="p-5 font-mono text-xs text-slate-800 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed select-text bg-[#FBF9F5]">
                      {doc.text}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Navigation bottom bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-[#EAE5D9] p-4 rounded-2xl shadow-xs">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#EAE5D9] bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Ingestion</span>
        </button>

        <button
          type="button"
          disabled={totalDocs === 0}
          onClick={() => router.push("/configure")}
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all ${
            totalDocs === 0
              ? "bg-slate-300 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 shadow-xs hover:shadow-md cursor-pointer"
          }`}
        >
          <span>Configure Assessment Blueprint</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
