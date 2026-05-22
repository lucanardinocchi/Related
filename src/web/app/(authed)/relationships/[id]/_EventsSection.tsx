"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Event } from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { EmptyState, Section } from "@/components/ui";
import { fmtDay, fmtTime } from "./_dateFormat";

interface Props {
  /** Show events whose attendee set includes any of these contact ids. */
  contactIds: string[];
  contextName: string;
}

function sourceLabel(source: Event["source"]): string {
  switch (source) {
    case "google":
      return "Google";
    case "outlook":
      return "Outlook";
    case "manual":
      return "Manual";
  }
}

function fmtEventStart(iso: string): string {
  return `${fmtDay(iso)} · ${fmtTime(iso)}`;
}

export function EventsSection({ contactIds, contextName }: Props) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const idSet = new Set(contactIds);
    void (async () => {
      try {
        const { events: client } = getBrowserDeps();
        const all = await client.listForAttendeeCloseness();
        if (cancelled) return;
        setEvents(
          all.filter((e) => e.attendees.some((a) => idSet.has(a.id))),
        );
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load events.");
        setEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactIds]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const list = events ?? [];
    const up: Event[] = [];
    const pa: Event[] = [];
    for (const e of list) {
      const t = new Date(e.start).getTime();
      if (Number.isNaN(t)) continue;
      if (t >= now) up.push(e);
      else pa.push(e);
    }
    up.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    pa.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
    return { upcoming: up, past: pa };
  }, [events]);

  const loading = events === null;

  return (
    <>
      <Section
        title="Upcoming events"
        meta={!loading ? `${upcoming.length}` : undefined}
      >
        {loading ? (
          <p className="text-[13px] text-fg-muted">Loading events…</p>
        ) : error ? (
          <p className="text-[13px] text-danger">{error}</p>
        ) : upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming events"
            description={`No upcoming calendar events with ${contextName}.`}
          />
        ) : (
          <EventList events={upcoming} />
        )}
      </Section>

      <Section
        title="Past events"
        meta={!loading ? `${past.length}` : undefined}
        defaultCollapsed
      >
        {loading ? (
          <p className="text-[13px] text-fg-muted">Loading events…</p>
        ) : past.length === 0 ? (
          <EmptyState
            title="No past events"
            description={`No past calendar events with ${contextName}.`}
          />
        ) : (
          <EventList events={past} />
        )}
      </Section>
    </>
  );
}

function EventList({ events }: { events: Event[] }) {
  return (
    <ul className="divide-y divide-divider">
      {events.map((e) => (
        <li key={e.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/calendar/${e.id}`}
                  className="truncate text-[14px] font-medium text-fg hover:underline"
                >
                  {e.title ?? "(untitled event)"}
                </Link>
                <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                  {sourceLabel(e.source)}
                </span>
              </div>
              {e.location ? (
                <p className="mt-0.5 truncate text-[12px] text-fg-muted">
                  {e.location}
                </p>
              ) : null}
            </div>
            <time className="shrink-0 font-[family-name:var(--font-jetbrains-mono)] text-[12px] tabular-nums text-fg-subtle">
              {fmtEventStart(e.start)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}
