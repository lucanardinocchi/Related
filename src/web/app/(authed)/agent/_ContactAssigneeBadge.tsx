"use client";

import {
  contactDisplayLabel,
  contactInitials,
} from "@related/shared";

export function ContactAssigneeBadge({
  name,
  ambiguousFirstNames,
  className,
}: {
  name: string;
  ambiguousFirstNames: Set<string>;
  className?: string;
}) {
  const label = contactDisplayLabel(name, ambiguousFirstNames);
  const initials = contactInitials(name);
  return (
    <span
      className={className ?? "inline-flex items-center gap-1.5 align-middle"}
    >
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9px] font-medium leading-none text-fg-muted"
        aria-hidden
      >
        {initials}
      </span>
      <span className="text-[12px] font-medium text-fg-muted">{label}</span>
    </span>
  );
}
