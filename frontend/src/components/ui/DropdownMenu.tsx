"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { Check } from "lucide-react";

interface DropdownContextValue {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggle: () => void;
  close: () => void;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

export function useDropdownMenu() {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error("useDropdownMenu must be used within a DropdownMenu provider");
  }
  return context;
}

// ---------------------------------------------------------------------------
// 1. Root Dropdown Container
// ---------------------------------------------------------------------------

export interface DropdownMenuProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function DropdownMenu({
  children,
  open: controlledOpen,
  onOpenChange,
  className = "relative inline-block text-left",
}: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = useState<boolean>(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (value: React.SetStateAction<boolean>) => {
      const next = typeof value === "function" ? value(isOpen) : value;
      if (!isControlled) {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, isOpen, onOpenChange]
  );

  const toggle = useCallback(() => setOpen((prev) => !prev), [setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen: setOpen, toggle, close }}>
      <div className={className}>{children}</div>
    </DropdownContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// 2. Dropdown Trigger
// ---------------------------------------------------------------------------

export interface DropdownMenuTriggerProps {
  children: ReactNode;
  asChild?: boolean;
  className?: string;
  disabled?: boolean;
}

export function DropdownMenuTrigger({
  children,
  asChild = false,
  className = "",
  disabled = false,
}: DropdownMenuTriggerProps) {
  const { toggle, isOpen } = useDropdownMenu();

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{
      onClick?: (e: React.MouseEvent) => void;
      "aria-expanded"?: boolean;
      "aria-haspopup"?: boolean;
      disabled?: boolean;
    }>;
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e);
        if (!disabled) toggle();
      },
      "aria-expanded": isOpen,
      "aria-haspopup": true,
      disabled: disabled || child.props.disabled,
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-expanded={isOpen}
      aria-haspopup="true"
      className={className}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 3. Dropdown Menu Content (Popover)
// ---------------------------------------------------------------------------

export interface DropdownMenuContentProps {
  children: ReactNode;
  align?: "start" | "end" | "center";
  side?: "bottom" | "top";
  className?: string;
  width?: string;
}

export function DropdownMenuContent({
  children,
  align = "end",
  side = "bottom",
  className = "",
  width = "w-48",
}: DropdownMenuContentProps) {
  const { isOpen, close } = useDropdownMenu();
  const contentRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (contentRef.current && !contentRef.current.contains(event.target as Node)) {
        close();
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen, close]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  const alignStyles = {
    start: "left-0",
    end: "right-0",
    center: "left-1/2 -translate-x-1/2",
  };

  const sideStyles = {
    bottom: "top-full mt-1.5",
    top: "bottom-full mb-1.5",
  };

  return (
    <div
      ref={contentRef}
      className={`absolute ${sideStyles[side]} ${alignStyles[align]} ${width} rounded-md bg-white border border-stone-200 shadow-xl p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-150 ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Dropdown Menu Items
// ---------------------------------------------------------------------------

export interface DropdownMenuItemProps {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  className?: string;
  closeOnClick?: boolean;
}

export function DropdownMenuItem({
  children,
  onClick,
  disabled = false,
  destructive = false,
  icon: Icon,
  shortcut,
  className = "",
  closeOnClick = true,
}: DropdownMenuItemProps) {
  const { close } = useDropdownMenu();

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    onClick?.(e);
    if (closeOnClick) close();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
        destructive
          ? "text-red-600 hover:bg-red-50 hover:text-red-700"
          : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
    >
      <div className="flex items-center gap-2 truncate">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />}
        <span className="truncate">{children}</span>
      </div>
      {shortcut && <span className="text-[10px] text-stone-400 font-mono pl-2">{shortcut}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 5. Dropdown Menu Checkbox Item
// ---------------------------------------------------------------------------

export interface DropdownMenuCheckboxItemProps {
  children: ReactNode;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function DropdownMenuCheckboxItem({
  children,
  checked = false,
  onCheckedChange,
  disabled = false,
  className = "",
}: DropdownMenuCheckboxItemProps) {
  const handleClick = () => {
    if (disabled) return;
    onCheckedChange?.(!checked);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
        checked ? "text-stone-900 bg-stone-50" : "text-stone-600 hover:bg-stone-100"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
    >
      <span
        className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 transition-colors ${
          checked ? "bg-[#B81104] border-[#B81104] text-[#FFFACD]" : "border-stone-300 bg-white"
        }`}
      >
        {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
      </span>
      <span className="truncate flex-1">{children}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 6. Label & Separator
// ---------------------------------------------------------------------------

export function DropdownMenuLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-stone-400 select-none ${className}`}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className = "" }: { className?: string }) {
  return <div className={`my-1 border-t border-stone-100 -mx-1.5 ${className}`} />;
}

