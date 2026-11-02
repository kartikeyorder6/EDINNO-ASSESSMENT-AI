"use client";

import React from "react";
import Link from "next/link";
import { ALL_GRADES, getGrade } from "../../../lib/curriculum-data";
import { StudioView } from "../types";
import {
  Cpu,
  ChevronLeft,
  BookOpen,
  Sparkles,
  LineChart,
  UploadCloud,
  Home,
  LogOut,
  X,
  HardDrive,
  Cloud,
} from "lucide-react";

interface StudioSidebarProps {
  activeGradeId: number;
  onSelectGrade: (gradeId: number) => void;
  activeView: StudioView;
  onSelectView: (view: StudioView) => void;
  isSidebarCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  userEmail: string | null;
  onSignOut: () => void;
  onOpenUploadModal: () => void;
  onOpenPdfStorage?: () => void;
}

export function StudioSidebar({
  activeGradeId,
  onSelectGrade,
  activeView,
  onSelectView,
  isSidebarCollapsed,
  onToggleCollapse,
  isMobileMenuOpen,
  onCloseMobileMenu,
  userEmail,
  onSignOut,
  onOpenUploadModal,
  onOpenPdfStorage,
}: StudioSidebarProps) {
  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={onCloseMobileMenu}
          className="fixed inset-0 bg-stone-950/40 backdrop-blur-xs z-40 md:hidden"
        />
      )}

      {/* Floating Sidebar Container */}
      <aside
        className={`fixed z-50 transition-all duration-300 ease-in-out ${
          isMobileMenuOpen
            ? "inset-x-4 top-4 bottom-4 w-auto flex"
            : "hidden md:flex flex-col"
        } ${
          isSidebarCollapsed ? "md:w-20 md:p-3" : "md:w-72 md:p-4"
        } left-4 top-4 bottom-4 rounded-lg bg-white/95 backdrop-blur-xl border border-stone-200/90 shadow-2xl shadow-stone-900/10 flex flex-col justify-between`}
      >
        {/* Top Section: Brand + Collapse Toggle */}
        <div className="flex flex-col gap-3">
          <div
            className={`flex items-center px-1.5 pt-1.5 transition-all ${
              isSidebarCollapsed
                ? "flex-col gap-2.5 justify-center"
                : "justify-between gap-2"
            }`}
          >
            <Link
              href="/"
              className={`flex items-center gap-2.5 group transition-transform ${
                isSidebarCollapsed ? "mx-auto" : ""
              }`}
            >
              <div className="w-8 h-8 rounded-md bg-[#B81104] text-[#FFFACD] flex items-center justify-center shadow-xs border border-[#8F0D03] group-hover:scale-105 transition-transform shrink-0">
                <Cpu className="w-4 h-4" />
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col leading-none">
                  <span className="text-base font-black tracking-tight text-stone-900 flex items-center gap-1.5">
                    EDINNO
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FFFACD] text-[#8F0D03] font-black border border-[#F4E88C]">
                      STUDIO
                    </span>
                  </span>
                  <span className="text-[10px] text-stone-400 font-medium">
                    STEM Assessment Engine
                  </span>
                </div>
              )}
            </Link>

            {/* Desktop Responsive Collapse Button */}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={isSidebarCollapsed ? "Expand sidebar navigation" : "Collapse sidebar navigation"}
              aria-expanded={!isSidebarCollapsed}
              className={`hidden md:flex items-center justify-center rounded-md border transition-all duration-200 cursor-pointer shadow-2xs active:scale-95 group focus-visible:ring-2 focus-visible:ring-[#B81104]/30 focus-visible:outline-hidden ${
                isSidebarCollapsed
                  ? "w-9 h-9 mx-auto bg-stone-100 hover:bg-[#B81104] hover:text-[#FFFACD] hover:border-[#8F0D03] text-stone-600 border-stone-200/90 hover:shadow-md"
                  : "w-8 h-8 bg-stone-100 hover:bg-stone-200/90 text-stone-600 hover:text-stone-900 border-stone-200/70 hover:border-stone-300"
              }`}
              title={isSidebarCollapsed ? "Expand Sidebar (Click or tap)" : "Collapse Sidebar"}
            >
              <ChevronLeft
                className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
                  isSidebarCollapsed ? "rotate-180" : "rotate-0"
                }`}
              />
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onCloseMobileMenu}
              aria-label="Close sidebar menu"
              className="md:hidden w-8 h-8 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="h-px bg-stone-100 mx-1" />

          {/* Grade Selector Strip */}
          <div className="flex flex-col gap-1.5">
            {!isSidebarCollapsed && (
              <div className="px-2 text-[10px] font-black text-stone-400 uppercase tracking-wider">
                Grades
              </div>
            )}

            <div
              className={`flex ${
                isSidebarCollapsed ? "flex-col items-center gap-1.5" : "flex-col gap-1"
              }`}
            >
              {ALL_GRADES.map((gNum) => {
                const gData = getGrade(gNum);
                const isActive = activeGradeId === gNum;
                return (
                  <button
                    key={gNum}
                    type="button"
                    onClick={() => onSelectGrade(gNum)}
                    className={`group relative flex items-center rounded-md transition-all cursor-pointer ${
                      isSidebarCollapsed
                        ? "w-11 h-11 justify-center"
                        : "w-full px-3 py-2 justify-between"
                    } ${
                      isActive
                        ? "bg-[#B81104] text-[#FFFACD] shadow-xs font-bold"
                        : "text-stone-700 hover:bg-stone-100/90 font-medium"
                    }`}
                    title={gData.name}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                          isActive
                            ? "bg-[#8F0D03] text-[#FFFACD]"
                            : "bg-stone-200/80 text-stone-700 group-hover:bg-stone-300"
                        }`}
                      >
                        {gNum}
                      </span>
                      {!isSidebarCollapsed && (
                        <span className="text-xs font-bold text-left truncate">
                          {gData.name}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-stone-100 mx-1" />

          {/* Sub-Views for Selected Grade */}
          <div className="flex flex-col gap-1.5">
            {!isSidebarCollapsed && (
              <div className="px-2 text-[10px] font-black text-stone-400 uppercase tracking-wider">
                <span>Grade {activeGradeId} Views</span>
              </div>
            )}

            {/* View 1: Curriculum */}
            <button
              type="button"
              onClick={() => onSelectView("curriculum")}
              className={`flex items-center gap-2.5 rounded-md transition-all cursor-pointer ${
                isSidebarCollapsed
                  ? "w-11 h-11 justify-center mx-auto"
                  : "w-full px-3 py-2"
              } ${
                activeView === "curriculum"
                  ? "bg-amber-50 text-[#8F0D03] border border-amber-200/80 font-bold"
                  : "text-stone-700 hover:bg-stone-100 font-medium"
              }`}
              title="Curriculum View"
            >
              <BookOpen className="w-4 h-4 shrink-0 text-[#B81104]" />
              {!isSidebarCollapsed && (
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold">Curriculum View</span>
                  <span className="text-[10px] text-stone-400">
                    Topics, Labs & Sensors
                  </span>
                </div>
              )}
            </button>

            {/* View 2: Generate Assessment */}
            <button
              type="button"
              onClick={() => onSelectView("generate")}
              className={`flex items-center gap-2.5 rounded-md transition-all cursor-pointer ${
                isSidebarCollapsed
                  ? "w-11 h-11 justify-center mx-auto"
                  : "w-full px-3 py-2"
              } ${
                activeView === "generate"
                  ? "bg-red-50 text-[#8F0D03] border border-red-200/80 font-bold"
                  : "text-stone-700 hover:bg-stone-100 font-medium"
              }`}
              title="Generate Assessment"
            >
              <Sparkles className="w-4 h-4 shrink-0 text-[#B81104]" />
              {!isSidebarCollapsed && (
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold">Generate Assessment</span>
                  <span className="text-[10px] text-stone-400">
                    AI Question Engine
                  </span>
                </div>
              )}
            </button>

            {/* View 3: Tracker */}
            <button
              type="button"
              onClick={() => onSelectView("tracker")}
              className={`flex items-center gap-2.5 rounded-md transition-all cursor-pointer ${
                isSidebarCollapsed
                  ? "w-11 h-11 justify-center mx-auto"
                  : "w-full px-3 py-2"
              } ${
                activeView === "tracker"
                  ? "bg-emerald-50 text-emerald-900 border border-emerald-200/80 font-bold"
                  : "text-stone-700 hover:bg-stone-100 font-medium"
              }`}
              title="Student Tracker"
            >
              <LineChart className="w-4 h-4 shrink-0 text-emerald-600" />
              {!isSidebarCollapsed && (
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold">Student Tracker</span>
                  <span className="text-[10px] text-stone-400">
                    Performance & Records
                  </span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Bottom Section: Quick Actions + Educator Info */}
        <div className="flex flex-col gap-2 pt-2 border-t border-stone-100">
          {/* Google Drive Centralized Workspace */}
          <Link
            href="/drive"
            className={`flex items-center gap-2 rounded-md text-stone-700 hover:bg-stone-100 hover:text-[#B81104] transition-colors cursor-pointer ${
              isSidebarCollapsed
                ? "w-11 h-11 justify-center mx-auto"
                : "w-full px-3 py-2 text-xs font-semibold"
            }`}
            title="Google Drive Centralized Workspace"
          >
            <HardDrive className="w-4 h-4 text-[#B81104]" />
            {!isSidebarCollapsed && <span>Drive Workspace</span>}
          </Link>

          {/* Cloudinary PDF Storage */}
          {onOpenPdfStorage && (
            <button
              type="button"
              onClick={onOpenPdfStorage}
              className={`flex items-center gap-2 rounded-md text-stone-700 hover:bg-stone-100 hover:text-[#B81104] transition-colors cursor-pointer ${
                isSidebarCollapsed
                  ? "w-11 h-11 justify-center mx-auto"
                  : "w-full px-3 py-2 text-xs font-semibold"
              }`}
              title="Cloudinary PDF Storage"
            >
              <Cloud className="w-4 h-4 text-[#B81104]" />
              {!isSidebarCollapsed && <span>PDF Storage</span>}
            </button>
          )}

          {/* Quick Action: PDF Upload */}
          <button
            type="button"
            onClick={onOpenUploadModal}
            className={`flex items-center gap-2 rounded-md text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer ${
              isSidebarCollapsed
                ? "w-11 h-11 justify-center mx-auto"
                : "w-full px-3 py-2 text-xs font-semibold"
            }`}
            title="Upload Curriculum PDF"
          >
            <UploadCloud className="w-4 h-4 text-stone-500" />
            {!isSidebarCollapsed && <span>Upload PDF</span>}
          </button>

          {/* Return Home */}
          <Link
            href="/"
            className={`flex items-center gap-2 rounded-md text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer ${
              isSidebarCollapsed
                ? "w-11 h-11 justify-center mx-auto"
                : "w-full px-3 py-2 text-xs font-semibold"
            }`}
            title="Exit to Landing Page"
          >
            <Home className="w-4 h-4 text-stone-500" />
            {!isSidebarCollapsed && <span>Exit to Home</span>}
          </Link>

          {/* User Status / Sign Out */}
          <div className="mt-1 pt-2 border-t border-stone-100 flex items-center justify-between px-1">
            <div className="flex items-center gap-2 truncate">
              <div className="w-6 h-6 rounded bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-bold shrink-0">
                {userEmail ? userEmail[0].toUpperCase() : "E"}
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col truncate leading-tight">
                  <span className="text-[11px] font-bold text-stone-800 truncate">
                    {userEmail ? userEmail.split("@")[0] : "Educator Mode"}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onSignOut}
              className={`p-1.5 rounded-md text-stone-400 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer ${
                isSidebarCollapsed ? "mx-auto mt-1" : ""
              }`}
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
