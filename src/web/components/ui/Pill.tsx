"use client";

import type { ReactNode, MouseEvent } from "react";
import { cn } from "@/lib/cn";

interface PillProps {
  /** Whether this pill is currently active. */
  active?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  className?: string;
}

/**
 * Filter pill used in horizontal pill bars above DataGrid surfaces (e.g.
 * the Calendar "All / Interactions / External" filter, the Commitments
 * origin/status filters). Distinct from Badge — pills are interactive.
 */
export function Pill({ active = false, onClick, children, className }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-[3px] text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        active
          ? "bg-fg text-fg-on-accent"
          : "bg-surface text-fg-muted hover:bg-hover hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}
