import type { ReactNode, HTMLAttributes, ElementType } from "react";
import { cn } from "@/lib/cn";

type BaseProps = HTMLAttributes<HTMLElement> & { children: ReactNode };

/**
 * Page display heading. Used at the top of route surfaces (Relationships
 * index page header, Calendar header). Per src/web/CONTEXT.md design system.
 */
export function Display({ className, children, ...rest }: BaseProps) {
  return (
    <h1
      className={cn(
        "text-[32px] leading-[40px] tracking-[-0.02em] font-medium text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </h1>
  );
}

/** Page H1. Section-titled detail pages use this for the entity name. */
export function H1({ className, children, ...rest }: BaseProps) {
  return (
    <h1
      className={cn(
        "text-[24px] leading-[32px] tracking-[-0.01em] font-medium text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </h1>
  );
}

/** Section title — bolder than body but quieter than H1. */
export function H2({ className, children, ...rest }: BaseProps) {
  return (
    <h2
      className={cn(
        "text-[18px] leading-[26px] tracking-[-0.005em] font-medium text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </h2>
  );
}

/** Eyebrow label above grouped content. Uppercase, micro tracking. */
export function Eyebrow({ className, children, ...rest }: BaseProps) {
  return (
    <div
      className={cn(
        "text-[11px] leading-[16px] tracking-[0.08em] uppercase font-medium text-fg-subtle",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

type AsProps = BaseProps & { as?: ElementType };

/** Body text — the default content size. */
export function Body({ className, children, as, ...rest }: AsProps) {
  const Tag = as ?? "p";
  return (
    <Tag
      className={cn(
        "text-[14px] leading-[22px] text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Small / supporting text — for property values and metadata. */
export function Small({ className, children, as, ...rest }: AsProps) {
  const Tag = as ?? "span";
  return (
    <Tag
      className={cn(
        "text-[13px] leading-[20px] text-fg-muted",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Micro text — table captions, footnotes, status pill text. */
export function Micro({ className, children, as, ...rest }: AsProps) {
  const Tag = as ?? "span";
  return (
    <Tag
      className={cn(
        "text-[11px] leading-[16px] tracking-[0.04em] text-fg-subtle",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Mono text for numbers, IDs, durations, dates that scan down a column.
 * Per src/web/CONTEXT.md — JetBrains Mono everywhere data-like values
 * appear in lists or grids.
 */
export function Mono({ className, children, as, ...rest }: AsProps) {
  const Tag = as ?? "span";
  return (
    <Tag
      className={cn(
        "font-[family-name:var(--font-jetbrains-mono)] text-[13px] leading-[20px] tabular-nums text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
