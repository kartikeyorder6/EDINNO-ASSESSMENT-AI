"use client";

import React from "react";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { Cpu, UserPlus, UploadCloud, ArrowRight, LogOut, HardDrive } from "lucide-react";

interface NavbarProps {
  user: User | null;
  onOpenAuth: (mode: "signin" | "signup", notice?: string) => void;
  onSignOut: () => void;
}

export function Navbar({ user, onOpenAuth, onSignOut }: NavbarProps) {
  return (
    <div className="fixed top-3 sm:top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <header className="pointer-events-auto w-full max-w-5xl h-14 px-4 sm:px-6 rounded-lg bg-white/95 backdrop-blur-md border border-stone-200 shadow-md flex items-center justify-between gap-3 transition-all duration-200">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="w-8 h-8 rounded-md bg-[#B81104] text-[#FFFACD] flex items-center justify-center shadow-xs group-hover:bg-[#8F0D03] transition-colors shrink-0">
            <Cpu className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold tracking-tight text-stone-900">
              ED<span className="text-[#B81104]">INNO</span>
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FFFACD] text-[#8F0D03] border border-[#F4E88C]">
              STUDIO
            </span>
          </div>
        </Link>

        {/* Auth / Studio Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {!user ? (
            <>
              <button
                type="button"
                onClick={() => onOpenAuth("signin")}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-stone-700 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Sign In
              </button>

              <button
                type="button"
                onClick={() => onOpenAuth("signup")}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-stone-500" />
                <span>Sign Up</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onOpenAuth("signin", "Please sign in or create an account to enter the studio.")
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold text-[#FFFACD] bg-[#B81104] hover:bg-[#8F0D03] shadow-xs border border-[#8F0D03] transition-colors cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Studio</span>
                <ArrowRight className="w-3 h-3 hidden sm:inline-block" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-stone-100 border border-stone-200 text-stone-800 text-xs font-medium max-w-[160px] sm:max-w-xs">
                <div className="w-5 h-5 rounded bg-stone-300 text-stone-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                  {user.email ? user.email.charAt(0).toUpperCase() : "U"}
                </div>
                <span className="truncate text-xs font-medium text-stone-800">
                  {user.email ? user.email.split("@")[0] : "Educator"}
                </span>
              </div>

              <Link
                href="/drive"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-stone-700 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 transition-colors"
              >
                <HardDrive className="w-3.5 h-3.5 text-[#B81104]" />
                <span>Drive</span>
              </Link>

              <Link
                href="/studio"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold text-[#FFFACD] bg-[#B81104] hover:bg-[#8F0D03] shadow-xs border border-[#8F0D03] transition-colors"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Studio</span>
                <ArrowRight className="w-3 h-3 hidden sm:inline-block" />
              </Link>

              <button
                type="button"
                onClick={onSignOut}
                title="Sign Out"
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-stone-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </>
          )}
        </div>
      </header>
    </div>
  );
}
