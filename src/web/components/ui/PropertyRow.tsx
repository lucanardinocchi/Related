"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/cn";

interface PropertyRowProps {
  label: string;
  /** Static value to render when not in edit mode. */
  value: ReactNode;
  /**
   * Optional placeholder shown when value is null/empty and the row is
   * editable — invites the User to click.
   */
  placeholder?: string;
  /**
   * When set, the row becomes inline-editable: clicking the value flips it
   * to an <input>, blur saves via this callback, Escape cancels. When
   * undefined, the row is read-only. The current text value is passed in
   * the saved arg.
   */
  onSave?: (next: string) => void | Promise<void>;
  /**
   * The raw text seed for the input when editing begins. Defaults to the
   * value cast to string. Use when `value` is a formatted node but the
   * underlying editable text is plainer (e.g. dates).
   */
  editValue?: string;
  className?: string;
}

/**
 * A label / value row used inside Section bodies. The label sits in a
 * fixed-width left column (Notion-style), the value flows to the right.
 * Inline-edit affordance reveals on hover when onSave is provided; saves
 * implicitly on blur.
 */
export function PropertyRow({
  label,
  value,
  placeholder = "Empty",
  onSave,
  editValue,
  className,
}: PropertyRowProps) {
  const id = useId();
  const isEditable = typeof onSave === "function";
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(
    editValue ?? (typeof value === "string" ? value : ""),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  function startEdit() {
    if (!isEditable) return;
    setDraft(editValue ?? (typeof value === "string" ? value : ""));
    setIsEditing(true);
  }

  async function commit() {
    setIsEditing(false);
    if (!onSave) return;
    await onSave(draft);
  }

  function cancel() {
    setIsEditing(false);
    setDraft(editValue ?? (typeof value === "string" ? value : ""));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.length === 0);

  return (
    <div
      className={cn(
        "group grid grid-cols-[160px_1fr] items-start gap-3 py-1.5",
        className,
      )}
    >
      <label
        htmlFor={isEditing ? id : undefined}
        className="select-none pt-[3px] text-[13px] leading-[20px] text-fg-muted"
      >
        {label}
      </label>
      {isEditing ? (
        <input
          id={id}
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          className="w-full rounded px-1.5 py-[3px] text-[14px] leading-[22px] text-fg outline outline-1 outline-border-strong focus-visible:outline-accent"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={!isEditable}
          className={cn(
            "w-full select-text rounded px-1.5 py-[3px] text-left text-[14px] leading-[22px]",
            isEditable && "cursor-text hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            !isEditable && "cursor-default",
            isEmpty ? "text-fg-subtle italic" : "text-fg",
          )}
        >
          {isEmpty ? placeholder : value}
        </button>
      )}
    </div>
  );
}
