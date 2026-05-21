"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/cn";
import { Input } from "./Input";
import {
  dateTimeToIso,
  isoToDateInput,
  isoToTimeInput,
} from "./DateTimeFields";

interface DateTimePropertyRowProps {
  label: string;
  iso: string;
  isAllDay?: boolean;
  onSave: (iso: string) => void | Promise<void>;
  className?: string;
}

function fmtDateTime(iso: string, isAllDay?: boolean): string {
  const d = new Date(iso);
  if (isAllDay) {
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Inline-editable date/time row with separate native date and time pickers
 * instead of a raw datetime-local text field.
 */
export function DateTimePropertyRow({
  label,
  iso,
  isAllDay = false,
  onSave,
  className,
}: DateTimePropertyRowProps) {
  const id = useId();
  const editRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [dateDraft, setDateDraft] = useState(isoToDateInput(iso));
  const [timeDraft, setTimeDraft] = useState(isoToTimeInput(iso));

  useEffect(() => {
    if (isEditing) dateRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    setDateDraft(isoToDateInput(iso));
    setTimeDraft(isoToTimeInput(iso));
  }, [iso]);

  function startEdit() {
    setDateDraft(isoToDateInput(iso));
    setTimeDraft(isoToTimeInput(iso));
    setIsEditing(true);
  }

  async function commit() {
    if (!dateDraft) {
      cancel();
      return;
    }
    const nextIso = dateTimeToIso(dateDraft, isAllDay ? "00:00" : timeDraft);
    setIsEditing(false);
    if (nextIso !== iso) await onSave(nextIso);
  }

  function cancel() {
    setIsEditing(false);
    setDateDraft(isoToDateInput(iso));
    setTimeDraft(isoToTimeInput(iso));
  }

  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (next && editRef.current?.contains(next)) return;
    void commit();
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <div
      className={cn(
        "group grid grid-cols-[160px_1fr] items-start gap-3 py-1.5",
        className,
      )}
    >
      <label
        htmlFor={isEditing ? `${id}-date` : undefined}
        className="select-none pt-[3px] text-[13px] leading-[20px] text-fg-muted"
      >
        {label}
      </label>
      {isEditing ? (
        <div
          ref={editRef}
          className="flex flex-wrap items-center gap-2"
          onBlur={handleBlur}
        >
          <Input
            id={`${id}-date`}
            ref={dateRef}
            type="date"
            value={dateDraft}
            onChange={(e) => setDateDraft(e.target.value)}
            onKeyDown={handleKey}
            className="w-auto min-w-[148px]"
          />
          {!isAllDay && (
            <Input
              id={`${id}-time`}
              type="time"
              value={timeDraft}
              step={900}
              onChange={(e) => setTimeDraft(e.target.value)}
              onKeyDown={handleKey}
              className="w-auto min-w-[112px]"
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="w-full cursor-text rounded px-1.5 py-[3px] text-left text-[14px] leading-[22px] text-fg hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {fmtDateTime(iso, isAllDay)}
        </button>
      )}
    </div>
  );
}
