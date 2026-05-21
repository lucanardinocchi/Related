"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Flag,
} from "lucide-react";
import type { Interaction, OpenThread } from "@related/shared";
import { Badge, EmptyState, Mono } from "@/components/ui";

interface Props {
  interactions: Interaction[];
  openThreads: OpenThread[];
  now?: Date;
}

type Item =
  | { kind: "interaction"; id: string; time: string; data: Interaction }
  | { kind: "commitment-opened"; id: string; time: string; data: OpenThread };

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function groupKey(item: Item, now: Date): string {
  const t = new Date(item.time);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - new Date(t).setHours(0, 0, 0, 0)) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 7) return "This week";
  if (diffDays > 7 && diffDays <= 30) return "This month";
  if (diffDays > 30 && diffDays <= 90) return "Last 3 months";
  if (diffDays > 90 && diffDays <= 365) return "This year";
  // Older: group by calendar year
  return `${t.getFullYear()}`;
}

const GROUP_ORDER = [
  "Today",
  "Yesterday",
  "This week",
  "This month",
  "Last 3 months",
  "This year",
];

/**
 * Reverse-chronological feed mixing past Interactions with Commitment-opened
 * events. Each row collapses to a single line; clicking expands to reveal
 * notes / metadata. Future-dated planned Interactions are intentionally
 * excluded here — they live in the dedicated Upcoming section above.
 */
export function ContextTimeline({ interactions, openThreads, now }: Props) {
  const ref = now ?? new Date();

  const items = useMemo<Item[]>(() => {
    const merged: Item[] = [];
    for (const i of interactions) {
      // Only past / settled entries belong on the historical timeline.
      if (i.status === "planned") continue;
      merged.push({ kind: "interaction", id: `i:${i.id}`, time: i.time, data: i });
    }
    for (const t of openThreads) {
      merged.push({
        kind: "commitment-opened",
        id: `c:${t.id}`,
        time: t.createdAt,
        data: t,
      });
    }
    merged.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return merged;
  }, [interactions, openThreads]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const k = groupKey(item, ref);
      const arr = map.get(k) ?? [];
      arr.push(item);
      map.set(k, arr);
    }
    // Preserve a sensible order: known buckets first in fixed order, then
    // any year buckets in descending year order.
    const known = GROUP_ORDER.filter((k) => map.has(k));
    const years = [...map.keys()]
      .filter((k) => !GROUP_ORDER.includes(k))
      .sort((a, b) => Number(b) - Number(a));
    return [...known, ...years].map((k) => ({ key: k, items: map.get(k)! }));
  }, [items, ref]);

  if (items.length === 0) {
    return (
      <EmptyState
        title="No context yet"
        description="Log an interaction or open a commitment to start the timeline."
      />
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ key, items: groupItems }) => (
        <div key={key}>
          <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
            {key}
          </div>
          <ul className="space-y-1.5">
            {groupItems.map((item) => (
              <TimelineRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TimelineRow({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);

  const icon =
    item.kind === "interaction" ? (
      <MessageSquare size={14} className="text-fg-muted" />
    ) : (
      <Flag size={14} className="text-fg-muted" />
    );

  const summary =
    item.kind === "interaction" ? (
      <InteractionSummary i={item.data} />
    ) : (
      <CommitmentSummary t={item.data} />
    );

  const expanded =
    item.kind === "interaction" ? (
      <InteractionDetails i={item.data} />
    ) : (
      <CommitmentDetails t={item.data} />
    );

  return (
    <li className="rounded-md border border-divider transition-colors hover:border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {open ? (
            <ChevronDown size={14} className="text-fg-muted" />
          ) : (
            <ChevronRight size={14} className="text-fg-muted" />
          )}
        </span>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {icon}
        </span>
        <span className="min-w-0 flex-1">{summary}</span>
        <span className="shrink-0 font-[family-name:var(--font-jetbrains-mono)] text-[12px] tabular-nums text-fg-muted">
          {fmtDateTime(item.time)}
        </span>
      </button>
      {open && (
        <div className="border-t border-divider px-10 py-3 text-[13px] leading-[20px] text-fg-muted">
          {expanded}
        </div>
      )}
    </li>
  );
}

function InteractionSummary({ i }: { i: Interaction }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="font-medium text-fg">{i.kind}</span>
      <StatusBadge status={i.status} />
      {i.notes && (
        <span className="truncate text-fg-muted">— {i.notes}</span>
      )}
    </span>
  );
}

function InteractionDetails({ i }: { i: Interaction }) {
  return (
    <Detail
      rows={[
        ["Kind", i.kind],
        ["Category", i.category],
        ["Status", <StatusBadge key="s" status={i.status} />],
        ["When", <Mono key="w">{fmtDateTime(i.time)}</Mono>],
        ["Notes", i.notes ?? "—"],
      ]}
    />
  );
}

function CommitmentSummary({ t }: { t: OpenThread }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="font-medium text-fg">Commitment opened</span>
      <Badge tone={t.direction === "me_owes_them" ? "warning" : "info"}>
        {t.direction === "me_owes_them" ? "I owe them" : "They owe me"}
      </Badge>
      <span className="truncate text-fg-muted">— {t.description}</span>
    </span>
  );
}

function CommitmentDetails({ t }: { t: OpenThread }) {
  return (
    <Detail
      rows={[
        ["What", t.description],
        [
          "Direction",
          <Badge
            key="d"
            tone={t.direction === "me_owes_them" ? "warning" : "info"}
          >
            {t.direction === "me_owes_them" ? "I owe them" : "They owe me"}
          </Badge>,
        ],
        ["Origin", t.origin ?? "—"],
        ["Communication", t.communicationStatus],
        ["Opened", <Mono key="o">{fmtDate(t.createdAt)}</Mono>],
        ["Closed", t.closedAt ? <Mono key="c">{fmtDate(t.closedAt)}</Mono> : "—"],
        ["Why it helps them", t.whyHelpsPerson ?? "—"],
        ["Why I can help", t.whyICanHelp ?? "—"],
      ]}
    />
  );
}

function StatusBadge({ status }: { status: Interaction["status"] }) {
  const tone =
    status === "occurred" || status === "attended"
      ? "approved"
      : status === "planned"
        ? "sent"
        : "lost";
  return <Badge tone={tone}>{status}</Badge>;
}

function Detail({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
      {rows.map(([label, value]) => (
        <Row key={label} label={label} value={value} />
      ))}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && (value === "—" || value.length === 0));
  return (
    <>
      <dt className="text-[12px] uppercase tracking-[0.06em] text-fg-subtle">
        {label}
      </dt>
      <dd className={isEmpty ? "text-fg-subtle italic" : "text-fg"}>
        {value}
      </dd>
    </>
  );
}

