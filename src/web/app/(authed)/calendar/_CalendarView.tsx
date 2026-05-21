"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import type {
  CalendarAnalytics,
  CalendarEvent,
  CalendarEventOverlay,
  Interaction,
  InteractionCategory,
  InteractionStatus,
} from "@related/shared";
import {
  AnalyticTile,
  Badge,
  AnalyticsRow,
  Card,
  DataGrid,
  Display,
  EmptyState,
  Eyebrow,
  Mono,
  Pill,
  Select,
} from "@/components/ui";
import type { BadgeTone, DataGridColumn } from "@/components/ui";
import { getBrowserDeps } from "@/lib/deps/client";
import { CumulativeGrowthChart } from "./_CumulativeGrowthChart";

const CATEGORIES: InteractionCategory[] = [
  "work",
  "meeting",
  "activity",
  "personal",
  "errands",
];

const PAST_STATUSES: InteractionStatus[] = [
  "attended",
  "missed",
  "cancelled",
];

const STATUS_TONE: Record<InteractionStatus, BadgeTone> = {
  planned: "sent",
  occurred: "approved",
  attended: "approved",
  missed: "lost",
  cancelled: "neutral",
};

type CalendarRow =
  | {
      kind: "interaction";
      id: string;
      time: string;
      title: string;
      subtitle: string | null;
      status: InteractionStatus;
      category: InteractionCategory;
    }
  | {
      kind: "external";
      id: string;
      externalEventId: string;
      time: string;
      title: string;
      subtitle: string | null;
      source: CalendarEvent["source"];
      status: InteractionStatus | null;
      category: InteractionCategory | null;
    };

type Filter = "all" | "interactions" | "external";

interface Props {
  interactions: Interaction[];
  externalEvents: CalendarEvent[];
  overlays: CalendarEventOverlay[];
  analytics: CalendarAnalytics;
  ownerId: string;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isPast(iso: string, now: Date): boolean {
  return new Date(iso).getTime() < now.getTime();
}

export function CalendarView({
  interactions,
  externalEvents,
  overlays,
  analytics,
  ownerId,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [pastOpen, setPastOpen] = useState(true);
  const [futureOpen, setFutureOpen] = useState(true);

  // Local override map so optimistic updates show immediately without a
  // full page refetch. Keyed by row id ("interaction:<id>" or
  // "external:<event_id>"). Falls back to the row's server-side values.
  type Override = { status?: InteractionStatus; category?: InteractionCategory };
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [, startTransition] = useTransition();

  const now = useMemo(() => new Date(), []);
  const overlayByEvent = useMemo(() => {
    const m = new Map<string, CalendarEventOverlay>();
    for (const o of overlays) m.set(o.eventId, o);
    return m;
  }, [overlays]);

  const allRows: CalendarRow[] = useMemo(() => {
    const fromInteractions: CalendarRow[] = interactions.map((i) => ({
      kind: "interaction" as const,
      id: i.id,
      time: i.time,
      title: i.kind,
      subtitle:
        i.contacts.length > 0
          ? i.contacts.map((c) => c.name).join(", ")
          : i.notes,
      status: i.status,
      category: i.category,
    }));
    const fromExternal: CalendarRow[] = externalEvents.map((e) => {
      const ov = overlayByEvent.get(e.externalEventId);
      return {
        kind: "external" as const,
        id: e.id,
        externalEventId: e.externalEventId,
        time: e.start,
        title: e.title ?? "(untitled)",
        subtitle: e.isAllDay ? "All day" : null,
        source: e.source,
        status: ov?.status ?? null,
        category: ov?.category ?? null,
      };
    });
    return [...fromInteractions, ...fromExternal].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
  }, [interactions, externalEvents, overlayByEvent]);

  // Merge in local overrides so the table reflects optimistic state.
  const mergedRows: CalendarRow[] = useMemo(() => {
    return allRows.map((r) => {
      const key = `${r.kind}:${r.kind === "external" ? r.externalEventId : r.id}`;
      const o = overrides[key];
      if (!o) return r;
      return {
        ...r,
        status: (o.status ?? r.status) as never,
        category: (o.category ?? r.category) as never,
      };
    });
  }, [allRows, overrides]);

  const rows = mergedRows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "interactions") return r.kind === "interaction";
    return r.kind === "external";
  });

  const past = rows.filter((r) => isPast(r.time, now));
  const future = rows.filter((r) => !isPast(r.time, now));

  // Past Interactions still marked "planned" — the User needs to assign
  // a real status. Surfaced in the dedicated widget below the chart.
  const pendingPlanned = useMemo(
    () =>
      mergedRows.filter(
        (r) =>
          r.kind === "interaction" &&
          isPast(r.time, now) &&
          r.status === "planned",
      ),
    [mergedRows, now],
  );

  // Build optimistic overrides for the merged list (used by the chart
  // immediately too).
  const optimisticInteractions: Interaction[] = useMemo(
    () =>
      interactions.map((i) => {
        const o = overrides[`interaction:${i.id}`];
        if (!o) return i;
        return {
          ...i,
          status: o.status ?? i.status,
          category: o.category ?? i.category,
        };
      }),
    [interactions, overrides],
  );
  const optimisticOverlays: CalendarEventOverlay[] = useMemo(() => {
    const merged = new Map(overlays.map((o) => [o.eventId, o]));
    for (const [key, o] of Object.entries(overrides)) {
      if (!key.startsWith("external:")) continue;
      const eventId = key.slice("external:".length);
      const prev = merged.get(eventId);
      merged.set(eventId, {
        eventId,
        status: o.status ?? prev?.status ?? null,
        category: o.category ?? prev?.category ?? null,
        updatedAt: new Date().toISOString(),
      });
    }
    return [...merged.values()];
  }, [overlays, overrides]);

  function setOverride(key: string, patch: Override) {
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function persistInteraction(
    id: string,
    patch: { status?: InteractionStatus; category?: InteractionCategory },
  ) {
    const { interactions: client } = getBrowserDeps();
    startTransition(() => {
      void (async () => {
        if (patch.status) await client.updateStatus(id, patch.status);
        if (patch.category) await client.updateCategory(id, patch.category);
      })();
    });
  }

  function persistOverlay(
    externalEventId: string,
    patch: { status?: InteractionStatus | null; category?: InteractionCategory | null },
  ) {
    const { calendarEvents } = getBrowserDeps();
    startTransition(() => {
      void calendarEvents.upsertOverlay({
        eventId: externalEventId,
        ownerId,
        ...patch,
      });
    });
  }

  function StatusSelect({ row }: { row: CalendarRow }) {
    const key = `${row.kind}:${row.kind === "external" ? row.externalEventId : row.id}`;
    const past = isPast(row.time, now);
    const value = row.status ?? "";
    return (
      <Select
        value={value}
        onChange={(e) => {
          const v = e.target.value as InteractionStatus | "";
          if (!v) return;
          setOverride(key, { status: v });
          if (row.kind === "interaction") persistInteraction(row.id, { status: v });
          else persistOverlay(row.externalEventId, { status: v });
        }}
        className="min-w-[120px]"
      >
        <option value="" disabled>
          {past ? "Set status…" : "—"}
        </option>
        {past
          ? PAST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))
          : (
            <option value="planned">planned</option>
          )}
      </Select>
    );
  }

  function CategorySelect({ row }: { row: CalendarRow }) {
    const key = `${row.kind}:${row.kind === "external" ? row.externalEventId : row.id}`;
    const value = row.category ?? "";
    return (
      <Select
        value={value}
        onChange={(e) => {
          const v = e.target.value as InteractionCategory;
          setOverride(key, { category: v });
          if (row.kind === "interaction") persistInteraction(row.id, { category: v });
          else persistOverlay(row.externalEventId, { category: v });
        }}
        className="min-w-[120px]"
      >
        {row.kind === "external" && row.category === null && (
          <option value="" disabled>
            Set type…
          </option>
        )}
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    );
  }

  const columns: DataGridColumn<CalendarRow>[] = [
    {
      key: "time",
      header: "When",
      width: "170px",
      mono: true,
      cell: (r) => fmtDateTime(r.time),
    },
    {
      key: "source",
      header: "Source",
      width: "120px",
      cell: (r) =>
        r.kind === "interaction" ? (
          <Badge tone="approved">Interaction</Badge>
        ) : (
          <Badge tone="info">{r.source === "google" ? "Google" : r.source}</Badge>
        ),
    },
    {
      key: "title",
      header: "Title",
      width: "minmax(180px, 1.6fr)",
      cell: (r) => <span className="truncate text-fg">{r.title}</span>,
    },
    {
      key: "subtitle",
      header: "Detail",
      width: "minmax(140px, 1fr)",
      cell: (r) => (
        <span className="truncate text-fg-muted">{r.subtitle ?? "—"}</span>
      ),
    },
    {
      key: "category",
      header: "Type",
      width: "150px",
      cell: (r) => <CategorySelect row={r} />,
    },
    {
      key: "status",
      header: "Status",
      width: "150px",
      cell: (r) => <StatusSelect row={r} />,
    },
  ];

  function quickAssign(row: CalendarRow, status: InteractionStatus) {
    const key = `${row.kind}:${row.kind === "external" ? row.externalEventId : row.id}`;
    setOverride(key, { status });
    if (row.kind === "interaction") persistInteraction(row.id, { status });
    else persistOverlay(row.externalEventId, { status });
  }

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Schedule</Eyebrow>
        <Display className="mt-1">Calendar</Display>
      </header>

      <CumulativeGrowthChart
        interactions={optimisticInteractions}
        externalEvents={externalEvents}
        overlays={optimisticOverlays}
        now={now}
      />

      {pendingPlanned.length > 0 && (
        <Card>
          <Eyebrow>Needs status</Eyebrow>
          <H3Inline>
            {pendingPlanned.length} past event
            {pendingPlanned.length === 1 ? "" : "s"} still marked planned
          </H3Inline>
          <p className="mt-1 text-[13px] leading-[20px] text-fg-muted">
            Assign a status so they count correctly on the chart and in your
            analytics.
          </p>
          <ul className="mt-3 divide-y divide-border">
            {pendingPlanned.slice(0, 8).map((r) => (
              <li
                key={`pending-${r.kind}:${r.kind === "external" ? r.externalEventId : r.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] text-fg">{r.title}</div>
                  <div className="font-[family-name:var(--font-jetbrains-mono)] text-[12px] text-fg-subtle">
                    {fmtDateTime(r.time)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {PAST_STATUSES.map((s) => (
                    <Pill key={s} onClick={() => quickAssign(r, s)}>
                      {s}
                    </Pill>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AnalyticsRow>
        <AnalyticTile
          label="Total entries"
          value={<Mono>{analytics.totalEntries}</Mono>}
        />
        <AnalyticTile
          label="Planned"
          value={<Mono>{analytics.interactionCounts.planned}</Mono>}
        />
        <AnalyticTile
          label="Attended"
          value={
            <Mono>
              {analytics.interactionCounts.attended +
                analytics.interactionCounts.occurred}
            </Mono>
          }
        />
        <AnalyticTile
          label="Missed"
          value={<Mono>{analytics.interactionCounts.missed}</Mono>}
        />
        <AnalyticTile
          label="Cancelled"
          value={<Mono>{analytics.interactionCounts.cancelled}</Mono>}
        />
        <AnalyticTile
          label="External (Google)"
          value={<Mono>{analytics.externalCountsBySource.google ?? 0}</Mono>}
        />
        <AnalyticTile
          label="Days w/ entries"
          value={<Mono>{analytics.daysWithEntries}</Mono>}
        />
      </AnalyticsRow>

      <div className="flex items-center gap-2">
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Pill>
        <Pill
          active={filter === "interactions"}
          onClick={() => setFilter("interactions")}
        >
          Interactions
        </Pill>
        <Pill
          active={filter === "external"}
          onClick={() => setFilter("external")}
        >
          External
        </Pill>
      </div>

      <CollapsibleSection
        title="Past"
        count={past.length}
        open={pastOpen}
        onToggle={() => setPastOpen((v) => !v)}
      >
        <DataGrid
          columns={columns}
          rows={past}
          rowKey={(r) => `past:${r.kind}:${r.id}`}
          emptyState={
            <EmptyState
              title="No past entries in window"
              description="Past Interactions and Google events from the last 30 days will appear here."
            />
          }
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Upcoming"
        count={future.length}
        open={futureOpen}
        onToggle={() => setFutureOpen((v) => !v)}
      >
        <DataGrid
          columns={columns}
          rows={future}
          rowKey={(r) => `future:${r.kind}:${r.id}`}
          emptyState={
            <EmptyState
              title="Nothing upcoming"
              description="Planned Interactions and Google events for the next 30 days will appear here."
            />
          }
        />
      </CollapsibleSection>
    </div>
  );
}

function H3Inline({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-1 text-[17px] font-semibold leading-[24px] text-fg">
      {children}
    </h3>
  );
}

interface CollapsibleSectionProps {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <ChevronDown
          size={16}
          className={`text-fg-muted transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span className="text-[15px] font-semibold text-fg">{title}</span>
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[12px] text-fg-subtle">
          {count}
        </span>
      </button>
      {open && children}
    </section>
  );
}
