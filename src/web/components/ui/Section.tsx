"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface SectionProps {
  title: string;
  /**
   * Optional small text rendered next to the title — e.g. count of items
   * inside ("3 commitments"). Avoid using for actions.
   */
  meta?: string;
  /** Right-aligned slot for actions (filter pills, "+ New", etc.). */
  actions?: ReactNode;
  /**
   * Whether the section starts collapsed. Defaults to false. Collapsing is
   * client-side only — not persisted across reloads (intentional; the User
   * tends to skim a detail page top-to-bottom on each visit).
   */
  defaultCollapsed?: boolean;
  /**
   * When true, the header is non-interactive (no chevron, no toggle). Used
   * for one-and-only-section pages where collapsing adds no value.
   */
  fixed?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * A vertically-stacked content section with a title row and a body. Used
 * as the primary container on detail surfaces (Relationship detail's Key
 * Details / Recent Context / Analytics / Full History sections). See
 * src/web/CONTEXT.md → Design system.
 */
export function Section({
  title,
  meta,
  actions,
  defaultCollapsed = false,
  fixed = false,
  children,
  className,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isCollapsible = !fixed;
  const isOpen = !collapsed;

  return (
    <section className={cn("border-b border-divider py-6 last:border-b-0", className)}>
      <header className="mb-3 flex items-center gap-3">
        {isCollapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="-ml-1 inline-flex items-center gap-2 rounded p-1 text-fg transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronDown size={14} className="text-fg-muted" />
            ) : (
              <ChevronRight size={14} className="text-fg-muted" />
            )}
            <span className="text-[18px] leading-[26px] tracking-[-0.005em] font-medium">
              {title}
            </span>
          </button>
        ) : (
          <span className="text-[18px] leading-[26px] tracking-[-0.005em] font-medium text-fg">
            {title}
          </span>
        )}
        {meta && <span className="text-[13px] text-fg-subtle">{meta}</span>}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
      {isOpen && <div>{children}</div>}
    </section>
  );
}
