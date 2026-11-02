"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X,
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ShieldAlert,
} from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup";
  onSuccess?: () => void;
  notice?: string;
}

function calculatePasswordStrength(pass: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!pass) return { score: 0, label: "", color: "bg-stone-200" };
  let score = 0;
  if (pass.length >= 8) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;
  if (/[A-Z]/.test(pass)) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-red-500" };
  if (score === 2) return { score: 2, label: "Fair", color: "bg-amber-500" };
  if (score === 3) return { score: 3, label: "Good", color: "bg-blue-500" };
  return { score: 4, label: "Strong", color: "bg-emerald-500" };
}

export function AuthModal({
  isOpen,
  onClose,
  initialMode = "signin",
  onSuccess,
  notice,
}: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPassword("");
        setErrorMsg(null);
        setSuccessMsg(null);
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleClose = () => {
    setPassword("");
    setErrorMsg(null);
    setSuccessMsg(null);
    onClose();
  };

  const supabase = createClient();
  const strength = calculatePasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // 1. Anti-abuse rate-limit check (client-side cooldown)
    if (failedAttempts >= 5) {
      setErrorMsg("Too many consecutive attempts. Please wait 30 seconds before retrying.");
      return;
    }

    // 2. Input Sanitization
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    // 3. Strict password requirement for signup
    if (!useMagicLink && mode === "signup") {
      if (password.length < 8) {
        setErrorMsg("For security, passwords must be at least 8 characters long.");
        return;
      }
      if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) {
        setErrorMsg("Please include at least one number or special character in your password.");
        return;
      }
    }

    setLoading(true);

    try {
      if (useMagicLink) {
        const { error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setSuccessMsg("Secure sign-in link dispatched! Check your email inbox.");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        setSuccessMsg("Authenticated successfully. Launching workspace...");
        setFailedAttempts(0);
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 600);
      } else {
        const { error, data } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        if (data.user && !data.session) {
          setSuccessMsg("Account created! Please check your email to verify your address.");
        } else {
          setSuccessMsg("Account created and authenticated!");
          setFailedAttempts(0);
          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 600);
        }
      }
    } catch (err: unknown) {
      setFailedAttempts((prev) => prev + 1);
      // Clean, sanitized error message without leaking stack traces
      const errorMessage = err instanceof Error ? err.message : "";
      let msg = errorMessage || "Authentication failed. Please verify your credentials.";
      if (msg.includes("Invalid login credentials")) {
        msg = "Incorrect email or password. Please try again or use a Magic Link.";
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-sm rounded-lg bg-white border border-stone-200 shadow-xl overflow-hidden p-5 sm:p-6 z-10 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <h3 id="auth-modal-title" className="text-base font-bold text-[#1C1917]">
            {mode === "signin" ? "Sign In" : "Create Account"}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice Banner */}
        {notice && (
          <div className="mt-3 p-2.5 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-medium">{notice}</span>
          </div>
        )}

        {/* Mode Toggle Tabs */}
        <div className="flex p-0.5 bg-stone-100 rounded-md my-3 border border-stone-200/70">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded transition-all cursor-pointer ${
              mode === "signin"
                ? "bg-white text-[#B81104] shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded transition-all cursor-pointer ${
              mode === "signup"
                ? "bg-white text-[#B81104] shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Status Messages */}
        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-3 p-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu"
                className="w-full pl-9 pr-3 py-2 rounded-md border border-stone-200 text-xs font-medium focus:outline-none focus:border-[#B81104] focus:ring-1 focus:ring-[#B81104]/20 transition-all bg-white"
              />
            </div>
          </div>

          {!useMagicLink && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-stone-700">
                  Password
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => setUseMagicLink(true)}
                    className="text-[11px] font-medium text-[#B81104] hover:underline cursor-pointer"
                  >
                    Magic link
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  minLength={mode === "signup" ? 8 : 6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-9 py-2 rounded-md border border-stone-200 text-xs font-medium focus:outline-none focus:border-[#B81104] focus:ring-1 focus:ring-[#B81104]/20 transition-all bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Password strength meter on signup */}
              {mode === "signup" && password.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-stone-500">Strength:</span>
                    <span className="font-semibold text-stone-700">{strength.label}</span>
                  </div>
                  <div className="h-1 w-full bg-stone-100 rounded-full overflow-hidden flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-full flex-1 transition-all ${
                          strength.score >= level ? strength.color : "bg-stone-200"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md text-xs font-bold text-[#FFFACD] bg-[#B81104] hover:bg-[#8F0D03] border border-[#8F0D03] flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-60 shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>
                    {useMagicLink
                      ? "Send Magic Link"
                      : mode === "signin"
                      ? "Sign In"
                      : "Create Account"}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {useMagicLink && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setUseMagicLink(false)}
                className="text-xs font-medium text-stone-500 hover:text-stone-800 cursor-pointer"
              >
                ← Back to Password Login
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
