"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "../../lib/store";
import { ResourceCategory } from "../../types";
import { CATEGORY_TOKENS } from "../../lib/design-tokens";
import { AppHeader } from "../../components/layout/AppHeader";
import StepProgress from "../../components/StepProgress";
import {
  Layers,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Copy,
  Check,
  Edit2,
} from "lucide-react";

function resolveCategory(key: string, metaCat?: string): ResourceCategory {
  if (metaCat && metaCat in CATEGORY_TOKENS) {
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
  return "topic";
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

  const totalChars = entries.reduce((acc, [, text]) => acc + text.length, 0);
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

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSaveTitle = () => {
    const trimmed = editedTitle.trim();
    if (!trimmed) return;
    setExtractedData(extractedResources, resourceMetadata, trimmed);
    setIsEditingTitle(false);
  };

  const categories: ResourceCategory[] = ["topic", "activity", "project"];

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <AppHeader activePage="merge" />
      <StepProgress currentStep={2} />

      <main className="max-w-7xl xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
        {/* Hero Header */}
        <div className="bg-[#FFFFFF] border border-[#EAE5D9] rounded-lg p-6 sm:p-8 shadow-xs transition-all">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#FFFACD] border border-[#F4E88C] text-xs font-bold text-[#8F0D03] mb-3">
                <Layers className="w-3.5 h-3.5" />
                <span>Step 2 of 4 • Curriculum Knowledge Corpus</span>
              </div>

              {isEditingTitle ? (
                <div className="flex items-center gap-2 mt-1 mb-1 max-w-xl">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="flex-1 px-3 py-1.5 text-base sm:text-xl font-black text-stone-900 border border-[#B81104] rounded-md focus:outline-none focus:ring-2 focus:ring-[#B81104]/10 bg-white"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveTitle}
                    className="px-3 py-1.5 rounded-md bg-[#B81104] text-[#FFFACD] text-xs font-bold hover:bg-[#8F0D03] cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditedTitle(cleanChapterStr(activeChapterName));
                      setIsEditingTitle(false);
                    }}
                    className="px-3 py-1.5 rounded-md border border-[#EAE5D9] text-stone-600 text-xs font-bold hover:bg-stone-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 mt-1 mb-1 group">
                  <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                    {cleanChapterStr(activeChapterName) || "Curriculum Chapter"}
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setEditedTitle(cleanChapterStr(activeChapterName));
                      setIsEditingTitle(true);
                    }}
                    className="p-1.5 text-stone-400 hover:text-[#B81104] hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                    title="Rename Chapter Title"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              <p className="text-sm text-stone-500 max-w-2xl mt-1.5 leading-relaxed">
                Verified curriculum modules individually extracted with PyMuPDF. Review text, circuit pinouts,
                and formulas itemized across Topics, Activities, Projects, and Extra Resources.
              </p>
            </div>

            {/* Aggregate Stats Capsule */}
            <div className="flex items-center gap-4 bg-[#FBF9F5] border border-[#EAE5D9] p-4 rounded-md shrink-0">
              <div className="text-center px-3 border-r border-[#EAE5D9]">
                <div className="text-xl font-black text-[#B81104]">{totalDocs}</div>
                <div className="text-[11px] font-bold text-stone-400">Total Files</div>
              </div>
              <div className="text-center px-3 border-r border-[#EAE5D9]">
                <div className="text-xl font-black text-stone-900">{estimatedWords.toLocaleString()}</div>
                <div className="text-[11px] font-bold text-stone-400">Total Words</div>
              </div>
              <div className="text-center px-3">
                <div className="text-xl font-black text-emerald-600">~{estimatedTokens.toLocaleString()}</div>
                <div className="text-[11px] font-bold text-stone-400">Context Tokens</div>
              </div>
            </div>
          </div>

          {/* 3-Category Live Breakdown Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 mt-6 border-t border-[#EAE5D9]">
            {categories.map((catKey) => {
              const token = CATEGORY_TOKENS[catKey];
              const Icon = token.icon;
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
                  className={`p-4 sm:p-5 rounded-md border text-left transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "border-[#B81104] bg-[#B81104]/[0.03] ring-2 ring-[#B81104]/15 shadow-xs scale-[1.01]"
                      : `${token.borderColor} ${token.lightBg} hover:shadow-xs hover:border-stone-300`
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-sm shadow-2xs ${token.badgeBg} ${token.badgeText}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        count > 0 ? "bg-stone-900 text-white shadow-2xs" : "bg-stone-200 text-stone-500"
                      }`}
                    >
                      {count} {count === 1 ? "File" : "Files"}
                    </span>
                  </div>
                  <div className="font-bold text-stone-900 text-sm truncate">{token.title}</div>
                  <div className="text-xs text-stone-500 mt-0.5 font-medium">
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
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    selectedCategoryTab === "all"
                      ? "bg-[#B81104] text-[#FFFACD] shadow-xs"
                      : "bg-[#FBF9F5] border border-[#EAE5D9] text-stone-600 hover:bg-white"
                  }`}
                >
                  All Documents ({totalDocs})
                </button>

                {categories.map((catKey) => {
                  const count = categoryCounts[catKey];
                  const token = CATEGORY_TOKENS[catKey];
                  const isActive = selectedCategoryTab === catKey;

                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setSelectedCategoryTab(catKey)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? "bg-stone-900 text-white shadow-xs"
                          : "bg-[#FBF9F5] border border-[#EAE5D9] text-stone-600 hover:bg-white"
                      }`}
                    >
                      <span>{token.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          isActive ? "bg-white/20 text-white" : "bg-stone-200 text-stone-600"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Box */}
              <div className="relative min-w-[260px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Filter curriculum by keyword..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8.5 pr-4 py-1.5 text-xs rounded-md border border-[#EAE5D9] bg-[#FBF9F5] text-stone-800 placeholder-stone-400 focus:outline-none focus:border-[#B81104] focus:ring-2 focus:ring-[#B81104]/10 transition-all"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Header & Bulk Controls */}
        <div className="flex items-center justify-between gap-4 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-stone-800">
              Extracted Curriculum Modules
            </span>
            <span className="text-xs text-stone-500 font-medium">
              ({filteredEntries.length} of {totalDocs} showing)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAll}
              className="px-2.5 py-1 text-xs font-bold rounded-md border border-[#EAE5D9] bg-white text-stone-600 hover:bg-stone-50 transition-all cursor-pointer shadow-2xs"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="px-2.5 py-1 text-xs font-bold rounded-md border border-[#EAE5D9] bg-white text-stone-600 hover:bg-stone-50 transition-all cursor-pointer shadow-2xs"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Modules List */}
        {filteredEntries.length === 0 ? (
          <div className="bg-white border border-[#EAE5D9] rounded-lg p-12 text-center shadow-xs">
            <Layers className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-stone-800">No Documents Found</h3>
            <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
              {searchQuery
                ? `No documents matched "${searchQuery}". Clear your search query to see all staged documents.`
                : "No curriculum documents staged. Please upload files in Step 1."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((doc) => {
              const isExpanded = Boolean(expandedKeys[doc.key]);
              const token = CATEGORY_TOKENS[doc.category];
              const Icon = token.icon;
              const isCopied = copiedKey === doc.key;

              return (
                <div
                  key={doc.key}
                  className="bg-white border border-[#EAE5D9] rounded-md overflow-hidden shadow-2xs transition-all hover:border-stone-300"
                >
                  <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border mt-0.5 ${token.badgeBg} ${token.badgeText} ${token.borderColor}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-stone-900 text-sm truncate">
                            {doc.fileName}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${token.badgeBg} ${token.badgeText}`}
                          >
                            {token.shortTitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-stone-500 mt-1 flex-wrap font-medium">
                          <span>{doc.pageCount} Pages</span>
                          <span>•</span>
                          <span>{doc.wordCount.toLocaleString()} Words</span>
                          <span>•</span>
                          <span>~{doc.tokenCount.toLocaleString()} Tokens</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(doc.key, doc.text)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#EAE5D9] text-xs font-bold text-stone-600 hover:bg-stone-50 transition-all cursor-pointer shadow-2xs"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700 font-bold">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-stone-400" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpand(doc.key)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                          isExpanded
                            ? "bg-stone-900 text-white shadow-xs"
                            : "border border-[#EAE5D9] bg-[#FBF9F5] text-stone-700 hover:bg-stone-100"
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
                      <p className="text-xs text-stone-500 line-clamp-1 italic">
                        &ldquo;{doc.meta.preview}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Full Extracted Text Drawer if expanded */}
                  {isExpanded && (
                    <div className="border-t border-[#EAE5D9] bg-[#FBF9F5]">
                      <div className="px-5 py-2.5 bg-stone-100/70 border-b border-[#EAE5D9] flex items-center justify-between text-[11px] text-stone-500 font-semibold">
                        <span>PyMuPDF Extracted Curriculum Text ({doc.charCount.toLocaleString()} characters)</span>
                        <span>UTF-8 Monospace View</span>
                      </div>
                      <div className="p-5 font-mono text-xs text-stone-800 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed select-text bg-[#FBF9F5]">
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-[#EAE5D9] p-4 sm:p-5 rounded-lg shadow-xs">
          <button
            type="button"
            onClick={() => router.push("/ingest")}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-[#EAE5D9] bg-white text-stone-700 text-xs font-bold hover:bg-stone-50 transition-all shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Ingestion</span>
          </button>

          <button
            type="button"
            disabled={totalDocs === 0}
            onClick={() => router.push("/configure")}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-md text-xs sm:text-sm font-black transition-all ${
              totalDocs === 0
                ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                : "bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] border border-[#8F0D03] shadow-md shadow-[#B81104]/20 hover:shadow-lg cursor-pointer"
            }`}
          >
            <span>Configure Assessment Blueprint</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
}
