"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase/client";

// Layout & Sections
import { Navbar } from "../components/layout/Navbar";
import { HeroSection } from "../features/landing/components/HeroSection";
import { MetricsSection } from "../features/landing/components/MetricsSection";
import { HowItWorksSection } from "../features/landing/components/HowItWorksSection";
import { SensorLabSection } from "../features/landing/components/SensorLabSection";
import { AssessmentTypesSection } from "../features/landing/components/AssessmentTypesSection";
import { CurriculumPreviewSection } from "../features/landing/components/CurriculumPreviewSection";
import { BottomCtaSection } from "../features/landing/components/BottomCtaSection";
import { FooterSection } from "../features/landing/components/FooterSection";

// Lazy-load AuthModal so unauthenticated landing bundle remains lean
const AuthModal = dynamic(
  () => import("../components/AuthModal").then((mod) => mod.AuthModal),
  { ssr: false }
);

export default function LandingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [authNotice, setAuthNotice] = useState<string | undefined>(undefined);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // 1. Clean any lingering URL query parameters (e.g. ?auth_required=true) on load
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    // 2. Fetch cached session immediately for zero-flicker restoration on refresh
    supabase.auth.getSession().then((res: { data: { session: Session | null } }) => {
      if (res.data.session?.user) {
        setUser(res.data.session.user);
      }
    });

    // 3. Cryptographically verify user with Supabase server
    supabase.auth.getUser().then((res: { data: { user: User | null } }) => {
      setUser(res.data.user ?? null);
    });

    // 4. Listen to real-time auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleOpenAuth = (mode: "signin" | "signup", notice?: string) => {
    setAuthModalMode(mode);
    setAuthNotice(notice);
    setAuthModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1C1917] font-sans antialiased selection:bg-[#B81104] selection:text-[#FFFACD]">
      <Navbar
        user={user}
        onOpenAuth={handleOpenAuth}
        onSignOut={handleSignOut}
      />

      <main>
        <HeroSection />
        <MetricsSection />
        <HowItWorksSection />
        <SensorLabSection />
        <AssessmentTypesSection />
        <CurriculumPreviewSection />
        <BottomCtaSection />
      </main>

      <FooterSection />

      {authModalOpen && (
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => {
            setAuthModalOpen(false);
            setAuthNotice(undefined);
          }}
          initialMode={authModalMode}
          notice={authNotice}
        />
      )}
    </div>
  );
}
