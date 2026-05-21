"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Users } from "lucide-react";
import {
  commitmentAnalytics,
  type CommitmentAnalytics,
  type CommitmentCommunicationStatus,
  type CommitmentOrigin,
  type OpenThread,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  AnalyticTile,
  Badge,
  Button,
  AnalyticsRow,
  Display,
  EmptyState,
  Eyebrow,
  Mono,
  Pill,
  Select,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";

type OriginFilter = "all" | CommitmentOrigin | "unset";
type StatusFilter = "all" | CommitmentCommunicationStatus;

export interface AssignableRelationship {
  id: string;
  label: string;
  kind: "contact" | "group";
}

interface Props {
  initialCommitments: OpenThread[];
  initialAnalytics: CommitmentAnalytics;
  assignableRelationships: AssignableRelationship[];
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
function daysOutstanding(iso: string): number {
  const created = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
}

/**
 * Mild urgency colouring on the days-outstanding chip. 14d crosses into
 * "warning" (User has likely missed a normal cycle), 30d into "danger".
 * Numbers chosen to match the User's typical biweekly-to-monthly cadence
 * for low-stakes commitments — adjust if/when we tune from real data.
 */
function daysOutstandingTone(days: number): "neutral" | "warning" | "danger" {
  if (days >= 30) return "danger";
  if (days >= 14) return "warning";
  return "neutral";
}

export function CommitmentsView({
  initialCommitments,
  initialAnalytics,
  assignableRelationships,
}: Props) {
  const deps = getBrowserDeps();
  const [commitments, setCommitments] = useState(initialCommitments);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Re-render every minute so "days outstanding" rolls over without a refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const relationshipById = useMemo(() => {
    const m = new Map<string, AssignableRelationship>();
    for (const r of assignableRelationships) m.set(r.id, r);
    return m;
  }, [assignableRelationships]);

  const rows = useMemo(() => {
    return commitments.filter((c) => {
      if (origin !== "all") {
        if (origin === "unset") {
          if (c.origin !== null) return false;
        } else if (c.origin !== origin) return false;
      }
      if (status !== "all" && c.communicationStatus !== status) return false;
      return true;
    });
  }, [commitments, origin, status]);

  function recompute(next: OpenThread[]) {
    setCommitments(next);
    setAnalytics(commitmentAnalytics({ commitments: next }));
  }

  function replaceById(id: string, updated: OpenThread) {
    recompute(commitments.map((c) => (c.id === id ? updated : c)));
  }

  async function setRowOrigin(id: string, value: CommitmentOrigin | "") {
    const updated = await deps.openThreads.setCommitmentMeta(id, {
      origin: value === "" ? null : value,
    });
    replaceById(id, updated);
  }

  async function setRowStatus(id: string, value: CommitmentCommunicationStatus) {
    const updated = await deps.openThreads.setCommitmentMeta(id, {
      communicationStatus: value,
    });
    replaceById(id, updated);
  }

  async function setRowRelationship(id: string, relationshipId: string) {
    const updated = await deps.openThreads.setOpenThreadRelationships(id, [
      relationshipId,
    ]);
    replaceById(id, updated);
  }

  async function setRowContext(
    id: string,
    field: "whyHelpsPerson" | "whyICanHelp",
    value: string,
  ) {
    const updated = await deps.openThreads.setCommitmentMeta(id, {
      [field]: value.trim() === "" ? null : value,
    });
    replaceById(id, updated);
  }

  async function closeRow(id: string) {
    await deps.openThreads.closeOpenThread(id);
    recompute(commitments.filter((c) => c.id !== id));
    setExpanded((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-10">
      <header>
        <Eyebrow>Open threads I owe</Eyebrow>
        <Display className="mt-1">Commitments</Display>
        <p className="mt-2 max-w-prose text-[14px] leading-[22px] text-fg-muted">
          Things you owe someone. Click a row to add the context that makes
          following through easier — who it helps and why you&apos;re the right
          person to do it.
        </p>
      </header>

      <AnalyticsRow>
        <AnalyticTile label="Open" value={<Mono>{analytics.total}</Mono>} />
        <AnalyticTile
          label="Asked of me"
          value={<Mono>{analytics.byOrigin.askedOfMe}</Mono>}
        />
        <AnalyticTile
          label="Self-led"
          value={<Mono>{analytics.byOrigin.selfLed}</Mono>}
        />
        <AnalyticTile
          label="Not yet communicated"
          value={<Mono>{analytics.byCommunicationStatus.notCommunicated}</Mono>}
        />
      </AnalyticsRow>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-y border-divider py-3">
        <FilterGroup label="Origin">
          <Pill active={origin === "all"} onClick={() => setOrigin("all")}>
            All
          </Pill>
          <Pill
            active={origin === "asked_of_me"}
            onClick={() => setOrigin("asked_of_me")}
          >
            Asked of me
          </Pill>
          <Pill
            active={origin === "self_led"}
            onClick={() => setOrigin("self_led")}
          >
            Self-led
          </Pill>
          <Pill active={origin === "unset"} onClick={() => setOrigin("unset")}>
            Unset
          </Pill>
        </FilterGroup>

        <FilterGroup label="Status">
          <Pill active={status === "all"} onClick={() => setStatus("all")}>
            All
          </Pill>
          <Pill
            active={status === "not_communicated"}
            onClick={() => setStatus("not_communicated")}
          >
            Not communicated
          </Pill>
          <Pill
            active={status === "confirmed"}
            onClick={() => setStatus("confirmed")}
          >
            Confirmed
          </Pill>
        </FilterGroup>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={
            commitments.length === 0
              ? "No open commitments"
              : "No commitments match these filters"
          }
          description={
            commitments.length === 0
              ? "Commitments born from an Agent Pass or captured directly appear here."
              : "Try clearing one of the filters above."
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <CommitmentCard
              key={c.id}
              commitment={c}
              expanded={expanded.has(c.id)}
              relationshipById={relationshipById}
              assignableRelationships={assignableRelationships}
              onToggle={() => toggleExpanded(c.id)}
              onClose={() => closeRow(c.id)}
              onSetOrigin={(v) => setRowOrigin(c.id, v)}
              onSetStatus={(v) => setRowStatus(c.id, v)}
              onSetRelationship={(v) => setRowRelationship(c.id, v)}
              onSetContext={(field, v) => setRowContext(c.id, field, v)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
        {label}
      </span>
      {children}
    </div>
  );
}

interface CommitmentCardProps {
  commitment: OpenThread;
  expanded: boolean;
  relationshipById: Map<string, AssignableRelationship>;
  assignableRelationships: AssignableRelationship[];
  onToggle: () => void;
  onClose: () => void;
  onSetOrigin: (value: CommitmentOrigin | "") => void;
  onSetStatus: (value: CommitmentCommunicationStatus) => void;
  onSetRelationship: (relationshipId: string) => void;
  onSetContext: (
    field: "whyHelpsPerson" | "whyICanHelp",
    value: string,
  ) => void;
}

function CommitmentCard({
  commitment: c,
  expanded,
  relationshipById,
  assignableRelationships,
  onToggle,
  onClose,
  onSetOrigin,
  onSetStatus,
  onSetRelationship,
  onSetContext,
}: CommitmentCardProps) {
  const currentRelId = c.relationshipIds[0] ?? "";
  const currentRel = relationshipById.get(currentRelId);
  const days = daysOutstanding(c.createdAt);
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
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="ml-1 min-w-0 flex-1 cursor-pointer text-left"
        >
          <div className="text-[15px] leading-[22px] text-fg">
            {c.description}
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
                c.communicationStatus === "confirmed" ? "success" : "neutral"
              }
            >
              {c.communicationStatus === "confirmed"
                ? "Confirmed"
                : "Not communicated"}
            </Badge>
            {c.origin && (
              <Badge tone="info">
                {c.origin === "asked_of_me" ? "Asked of me" : "Self-led"}
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
              onChange={(e) => onSetRelationship(e.target.value)}
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
            <Select
              value={c.origin ?? ""}
              onChange={(e) =>
                onSetOrigin(e.target.value as CommitmentOrigin | "")
              }
              className="max-w-sm"
            >
              <option value="">Unset</option>
              <option value="asked_of_me">Asked of me</option>
              <option value="self_led">Self-led</option>
            </Select>

            <MetaLabel>Communication</MetaLabel>
            <Select
              value={c.communicationStatus}
              onChange={(e) =>
                onSetStatus(e.target.value as CommitmentCommunicationStatus)
              }
              className="max-w-sm"
            >
              <option value="not_communicated">Not communicated</option>
              <option value="confirmed">Confirmed</option>
            </Select>

            <MetaLabel>Opened</MetaLabel>
            <div className="font-[family-name:var(--font-jetbrains-mono)] text-[13px] tabular-nums text-fg-muted">
              {fmtDate(c.createdAt)}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ContextField
              label="Why this helps them"
              placeholder="What changes for them when you follow through?"
              value={c.whyHelpsPerson ?? ""}
              onCommit={(v) => onSetContext("whyHelpsPerson", v)}
            />
            <ContextField
              label="Why I'm positioned to help"
              placeholder="What do you have — knowledge, time, network — that makes this yours to do?"
              value={c.whyICanHelp ?? ""}
              onCommit={(v) => onSetContext("whyICanHelp", v)}
            />
          </div>
        </div>
      )}
    </li>
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
