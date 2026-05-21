"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Users } from "lucide-react";
import type {
  CommitmentCommunicationStatus,
  CommitmentOrigin,
  OpenThread,
  SetCommitmentMetaInput,
} from "@related/shared";
import { Badge, Button, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface AssignableRelationship {
  id: string;
  label: string;
  kind: "contact" | "group";
}

export interface OpenThreadRowProps {
  thread: OpenThread;
  onUpdateDescription?: (description: string) => void | Promise<void>;
  onSetCommitmentMeta: (meta: SetCommitmentMetaInput) => void | Promise<void>;
  onClose: () => void | Promise<void>;
  /** Compact inline layout for relationship detail. */
  variant?: "compact" | "expandable";
  /** Only used when variant="expandable". */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Only used when variant="expandable". */
  assignableRelationships?: AssignableRelationship[];
  onSetRelationship?: (relationshipId: string) => void | Promise<void>;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Whole-day count between the thread's creation and now. UTC-anchored to
 * keep the value deterministic across the SSR/CSR boundary and across the
 * User's timezone. "0d" the day it was opened, "1d" the next calendar day.
 */
export function daysOutstanding(iso: string): number {
  const created = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
}

/**
 * Mild urgency colouring on the days-outstanding chip. 14d crosses into
 * "warning" (User has likely missed a normal cycle), 30d into "danger".
 */
export function daysOutstandingTone(
  days: number,
): "neutral" | "warning" | "danger" {
  if (days >= 30) return "danger";
  if (days >= 14) return "warning";
  return "neutral";
}

function OriginSelect({
  value,
  onChange,
  className,
}: {
  value: CommitmentOrigin | null;
  onChange: (value: CommitmentOrigin | "") => void;
  className?: string;
}) {
  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value as CommitmentOrigin | "")}
      className={className}
    >
      <option value="">Unset</option>
      <option value="asked_of_me">Asked of me</option>
      <option value="self_led">Self-led</option>
    </Select>
  );
}

function CommunicationSelect({
  value,
  onChange,
  className,
}: {
  value: CommitmentCommunicationStatus;
  onChange: (value: CommitmentCommunicationStatus) => void;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onChange={(e) =>
        onChange(e.target.value as CommitmentCommunicationStatus)
      }
      className={className}
    >
      <option value="not_communicated">Not communicated</option>
      <option value="confirmed">Confirmed</option>
    </Select>
  );
}

function MetaLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1.5 text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
      {children}
    </div>
  );
}

/**
 * Debounced-on-blur text field. Avoids one Supabase round-trip per keystroke
 * while still persisting promptly when the User moves on. Local state is
 * resynced when the persisted value changes (e.g. after a save echoes back).
 */
function ContextField({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
        {label}
      </span>
      <Textarea
        className="mt-1.5 min-h-[88px]"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
      />
    </label>
  );
}

function InlineEditableText({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => setDraft(value), [value]);

  async function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next.length === 0 || next === value) return;
    await onSave(next);
  }

  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        className={`w-full rounded px-1.5 py-[3px] outline outline-1 outline-border-strong focus-visible:outline-accent ${className ?? ""}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`w-full cursor-text select-text rounded px-1.5 py-[3px] text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${className ?? ""}`}
    >
      {value}
    </button>
  );
}

function CompactOpenThreadRow({
  thread,
  onUpdateDescription,
  onSetCommitmentMeta,
  onClose,
}: OpenThreadRowProps) {
  return (
    <li className="group flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-[240px] flex-1">
        <InlineEditableText
          value={thread.description}
          onSave={onUpdateDescription ?? (() => {})}
          className="text-[14px] leading-[22px] text-fg"
        />
        <div className="mt-1 text-[12px] text-fg-subtle">
          Opened {fmtDate(thread.createdAt)}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <span className="mb-0.5 text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            Origin
          </span>
          <OriginSelect
            value={thread.origin}
            onChange={(origin) =>
              onSetCommitmentMeta({
                origin: origin === "" ? null : origin,
              })
            }
            className="min-w-[150px]"
          />
        </div>

        <div className="flex flex-col">
          <span className="mb-0.5 text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
            Communication
          </span>
          <CommunicationSelect
            value={thread.communicationStatus}
            onChange={(communicationStatus) =>
              onSetCommitmentMeta({ communicationStatus })
            }
            className="min-w-[170px]"
          />
        </div>

        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </li>
  );
}

function ExpandableOpenThreadRow({
  thread,
  onSetCommitmentMeta,
  onClose,
  expanded = false,
  onToggleExpanded,
  assignableRelationships = [],
  onSetRelationship,
}: OpenThreadRowProps) {
  const currentRelId = thread.relationshipIds[0] ?? "";
  const currentRel = assignableRelationships.find((r) => r.id === currentRelId);
  const days = daysOutstanding(thread.createdAt);
  const daysTone = daysOutstandingTone(days);
  const isUnassigned = !currentRel;

  return (
    <li
      className={cn(
        "rounded-lg border border-divider bg-bg transition-colors",
        expanded ? "shadow-[0_1px_0_rgba(0,0,0,0.02)]" : "hover:border-border",
      )}
    >
      <div className="flex items-start gap-1 px-3 py-3">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="ml-1 min-w-0 flex-1 cursor-pointer text-left"
        >
          <div className="text-[15px] leading-[22px] text-fg">
            {thread.description}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-[18px] text-fg-muted">
            <span className="inline-flex items-center gap-1">
              {currentRel?.kind === "group" && <Users size={12} />}
              <span className={cn(isUnassigned && "text-warning")}>
                {isUnassigned ? "Unassigned" : `For ${currentRel.label}`}
                {currentRel?.kind === "group" && " (group)"}
              </span>
            </span>
            <span className="text-fg-subtle">·</span>
            <Badge
              tone={
                daysTone === "danger"
                  ? "danger"
                  : daysTone === "warning"
                    ? "warning"
                    : "neutral"
              }
            >
              {days}d outstanding
            </Badge>
            <Badge
              tone={
                thread.communicationStatus === "confirmed"
                  ? "success"
                  : "neutral"
              }
            >
              {thread.communicationStatus === "confirmed"
                ? "Confirmed"
                : "Not communicated"}
            </Badge>
            {thread.origin && (
              <Badge tone="info">
                {thread.origin === "asked_of_me" ? "Asked of me" : "Self-led"}
              </Badge>
            )}
          </div>
        </button>
        <div className="shrink-0">
          <Button
            variant="ghost"
            size="sm"
            leading={<CheckCircle2 size={14} />}
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-divider px-3 py-4">
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-[160px_1fr]">
            <MetaLabel>For</MetaLabel>
            <Select
              value={currentRelId}
              onChange={(e) => onSetRelationship?.(e.target.value)}
              className={cn("max-w-sm", isUnassigned && "border-warning")}
            >
              {isUnassigned && (
                <option value="" disabled>
                  Unassigned — pick someone
                </option>
              )}
              {assignableRelationships.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kind === "group" ? `${r.label} (group)` : r.label}
                </option>
              ))}
            </Select>

            <MetaLabel>Origin</MetaLabel>
            <OriginSelect
              value={thread.origin}
              onChange={(origin) =>
                onSetCommitmentMeta({
                  origin: origin === "" ? null : origin,
                })
              }
              className="max-w-sm"
            />

            <MetaLabel>Communication</MetaLabel>
            <CommunicationSelect
              value={thread.communicationStatus}
              onChange={(communicationStatus) =>
                onSetCommitmentMeta({ communicationStatus })
              }
              className="max-w-sm"
            />

            <MetaLabel>Opened</MetaLabel>
            <div className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] tabular-nums text-fg-muted">
              {fmtDate(thread.createdAt)}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ContextField
              label="Why this helps them"
              placeholder="What changes for them when you follow through?"
              value={thread.whyHelpsPerson ?? ""}
              onCommit={(v) =>
                onSetCommitmentMeta({
                  whyHelpsPerson: v.trim() === "" ? null : v,
                })
              }
            />
            <ContextField
              label="Why I'm positioned to help"
              placeholder="What do you have — knowledge, time, network — that makes this yours to do?"
              value={thread.whyICanHelp ?? ""}
              onCommit={(v) =>
                onSetCommitmentMeta({
                  whyICanHelp: v.trim() === "" ? null : v,
                })
              }
            />
          </div>
        </div>
      )}
    </li>
  );
}

export function OpenThreadRow(props: OpenThreadRowProps) {
  if (props.variant === "expandable") {
    return <ExpandableOpenThreadRow {...props} />;
  }
  return <CompactOpenThreadRow {...props} />;
}
