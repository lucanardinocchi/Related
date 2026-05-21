"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional supporting subtitle under the title. */
  subtitle?: string;
  /** Modal body. */
  children: ReactNode;
  /** Footer slot — typically Cancel + primary Button. */
  footer?: ReactNode;
  /** Width tier. Defaults to md (480px). */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-[400px]",
  md: "max-w-[520px]",
  lg: "max-w-[720px]",
};

/**
 * Centered modal for capture and confirmation flows. Closes on Escape and
 * on backdrop click. Modal content is the appropriate surface for multi-
 * field forms (add Contact, add Commitment) — inline single-field edits
 * use PropertyRow instead.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 backdrop-blur-sm px-4 py-16"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full rounded-lg bg-bg shadow-[var(--shadow-modal)]",
          sizeClasses[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-divider px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[18px] leading-[26px] tracking-[-0.005em] font-medium text-fg">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-[13px] leading-[20px] text-fg-muted">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 rounded p-1 text-fg-muted transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-divider px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
