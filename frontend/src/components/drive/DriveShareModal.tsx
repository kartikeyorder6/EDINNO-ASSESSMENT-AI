"use client";

import React, { useState, useEffect } from "react";
import {
  DriveFileItem,
  DrivePermissionItem,
  fetchDrivePermissions,
  shareDriveFile,
  revokeDrivePermission,
} from "../../lib/drive-api";
import {
  X,
  Share2,
  UserPlus,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { SelectDropdown } from "../ui";

interface DriveShareModalProps {
  file: DriveFileItem | null;
  onClose: () => void;
}

export function DriveShareModal({ file, onClose }: DriveShareModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"reader" | "commenter" | "writer">("reader");
  const [permissions, setPermissions] = useState<DrivePermissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!file) return;
    let active = true;
    fetchDrivePermissions(file.id)
      .then((perms) => {
        if (active) {
          setPermissions(perms);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) setIsLoading(false);
      });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      active = false;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [file, onClose]);

  if (!file) return null;

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const newPerm = await shareDriveFile(file.id, cleanEmail, role);
      setPermissions((prev) => [...prev, newPerm]);
      setEmail("");
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to grant collaborator permission.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokePermission = async (permId: string) => {
    try {
      await revokeDrivePermission(file.id, permId);
      setPermissions((prev) => prev.filter((p) => p.id !== permId));
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to revoke collaborator permission.");
    }
  };

  const handleCopyLink = () => {
    const link = file.web_view_link || window.location.href;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Share: ${file.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-lg bg-white border border-stone-200 shadow-xl p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-red-50 text-[#B81104] border border-red-200 flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900 truncate">
                Share &quot;{file.name}&quot;
              </h3>
              <p className="text-[11px] text-stone-500">
                Manage collaborator permissions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Add Collaborator Form */}
        <form onSubmit={handleShareSubmit} className="space-y-2">
          <label className="block text-[11px] font-semibold text-stone-700">
            Add Collaborator
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              required
              placeholder="colleague@institution.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 text-xs px-3 py-2 rounded-md border border-stone-300 focus:outline-none focus:border-[#B81104] bg-stone-50/60"
            />
            <div className="w-28 shrink-0">
              <SelectDropdown
                size="sm"
                value={role}
                onChange={(val) => setRole(val as "reader" | "commenter" | "writer")}
                options={[
                  { value: "reader", label: "Viewer" },
                  { value: "commenter", label: "Commenter" },
                  { value: "writer", label: "Editor" },
                ]}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#B81104] hover:bg-[#8F0D03] text-[#FFFACD] text-xs font-semibold border border-[#8F0D03] shadow-xs disabled:opacity-50 cursor-pointer transition-all shrink-0"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              <span>Add</span>
            </button>
          </div>
        </form>

        {/* People With Access */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-600">
              Collaborators ({permissions.length})
            </span>
            <button
              type="button"
              onClick={handleCopyLink}
              className="text-xs font-semibold text-[#B81104] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedLink ? "Copied" : "Copy Link"}</span>
            </button>
          </div>

          <div className="divide-y divide-stone-100 rounded-md border border-stone-200 bg-stone-50/50 max-h-44 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-stone-400">Loading...</div>
            ) : permissions.length === 0 ? (
              <div className="p-4 text-center text-xs text-stone-400">
                Only workspace members currently have access.
              </div>
            ) : (
              permissions.map((perm) => (
                <div key={perm.id} className="p-2.5 flex items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded bg-stone-200 text-stone-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                      {(perm.email_address || perm.display_name || "U")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold text-stone-900 block truncate">
                        {perm.display_name || perm.email_address}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                      {perm.role}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRevokePermission(perm.id)}
                      title="Revoke access"
                      className="p-1 rounded text-stone-400 hover:text-red-600 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-stone-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
