"use client";

import React, { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { User } from "@supabase/supabase-js";
import {
  Cpu,
  UploadCloud,
  Layers,
  Settings2,
  CheckSquare,
  HardDrive,
  Sparkles,
  LogOut,
  UserCheck,
  Menu,
  X,
  ArrowRight,
} from "lucide-react";
import dynamic from "next/dynamic";

const AuthModal = dynamic(
  () => import("../AuthModal").then((mod) => mod.AuthModal),
  { ssr: false }
);

interface AppHeaderProps {
  activePage?: "studio" | "ingest" | "merge" | "configure" | "results" | "drive";
  className?: string;
}

const emptySubscribe = () => () => {};

export function AppHeader({ activePage, className = "" }: AppHeaderProps) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isHydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);

  useEffect(() => {
    supabase.auth.getSession().then((res) => {
      if (res.data.session?.user) {
        setUser(res.data.session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.warn("Sign out error:", err);
    }
  };

  const currentTab = activePage || (
    pathname.includes("/studio")
      ? "studio"
      : pathname.includes("/ingest")
      ? "ingest"
      : pathname.includes("/merge")
      ? "merge"
      : pathname.includes("/configure")
      ? "configure"
      : pathname.includes("/results")
      ? "results"
      : pathname.includes("/drive")
      ? "drive"
      : undefined
  );

  const navLinks = [
    { id: "studio", label: "Studio", href: "/studio", icon: Sparkles },
    { id: "ingest", label: "Ingest", href: "/ingest", icon: UploadCloud },
    { id: "merge", label: "Merge", href: "/merge", icon: Layers },
    { id: "configure", label: "Configure", href: "/configure", icon: Settings2 },
    { id: "results", label: "Workbench", href: "/results", icon: CheckSquare },
    { id: "drive", label: "Drive & Cloud", href: "/drive", icon: HardDrive },
  ];

  return (
    <>
      <header
        className={`sticky top-0 z-40 w-full bg-[#FFFFFF]/90 backdrop-blur-xl border-b border-[#EAE5D9] transition-all ${className}`}
      >
        <div className="max-w-7xl xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group shrink-0">
              <div className="w-8 h-8 rounded-md bg-[#B81104] text-[#FFFACD] flex items-center justify-center shadow-xs group-hover:bg-[#8F0D03] transition-colors border border-[#8F0D03]">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-[#1C1917]">
                  ED<span className="text-[#B81104]">INNO</span>
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
                  STUDIO
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-0.5 bg-[#FBF9F5] p-1 rounded-md border border-[#EAE5D9]">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = currentTab === link.id;
              return (
                <Link
                  key={link.id}
                  href={link.href}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-[#B81104] text-[#FFFACD] shadow-xs border border-[#8F0D03]"
                      : "text-stone-600 hover:text-stone-900 hover:bg-white"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Actions & User Session */}
          <div className="flex items-center gap-2">
            {isHydrated && user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-100 border border-stone-200 text-stone-800 text-xs font-medium">
                  <UserCheck className="w-3.5 h-3.5 text-stone-600" />
                  <span className="truncate max-w-[120px]">
                    {user.email ? user.email.split("@")[0] : "Educator"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Sign Out"
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-stone-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all cursor-pointer flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : isHydrated ? (
              <button
                type="button"
                onClick={() => {
                  setAuthMode("signin");
                  setIsAuthModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-stone-700 hover:text-[#B81104] hover:bg-stone-50 border border-stone-200 transition-all cursor-pointer"
              >
                Sign In
              </button>
            ) : null}

            {currentTab !== "studio" && (
              <Link
                href="/studio"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold text-[#FFFACD] bg-[#B81104] hover:bg-[#8F0D03] border border-[#8F0D03] shadow-xs transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Studio</span>
                <ArrowRight className="w-3 h-3 hidden md:inline-block" />
              </Link>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 transition-all cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-[#EAE5D9] bg-[#FFFFFF] px-4 py-2 space-y-1 animate-in fade-in duration-100">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = currentTab === link.id;
              return (
                <Link
                  key={link.id}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-[#B81104] text-[#FFFACD] border border-[#8F0D03]"
                      : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Auth Modal */}
      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialMode={authMode}
          onSuccess={() => setIsAuthModalOpen(false)}
        />
      )}
    </>
  );
}

