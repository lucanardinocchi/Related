// Daily Calendar density collector — Edge Function shell. Triggered by
// pg_cron at 10 AM UTC (per-User-local time is a deferred refinement).
//
// Today it uses an inlined FakeCalendarFetcher: the daily loop exists,
// the DB shape exists, and the agent prompts pull from
// `inferred_signal_calendar` — but the *source* of the events is fake
// until Google Calendar OAuth (or iOS EventKit) is provisioned. When
// that lands, replace `fetchCalendarEvents` below with the OAuth-backed
// fetcher; the rest of the loop (collector, cron, summary, RLS) is
// unchanged.
//
// Deploy:
//   supabase functions deploy sync-calendar
//   # Later, when OAuth lands:
//   supabase secrets set CALENDAR_PROVIDER=google
//   supabase secrets set GOOGLE_OAUTH_CLIENT_ID=...
//   supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=...
//
// Request body (optional): { asOf?: ISO string, ownerId?: string }.
// When called from pg_cron the body is empty and the function iterates
// over every owner with a calendar connected (today: every authenticated
// User, since no row tracks the OAuth state yet — a TODO for the OAuth
// PR).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

interface RawCalendarEvent {
  id: string;
  title?: string | null;
  start: string;
  end: string;
  isAllDay: boolean;
}

interface SyncRequest {
  asOf?: string;
  ownerId?: string;
}

interface CalendarCollectionSummary {
  eventsWritten: number;
  windowEnd: string;
  ownerId: string;
}

const WINDOW_DAYS = 7;

/**
 * Placeholder source. Replace with a Google Calendar OAuth fetcher
 * (or EventKit on iOS) once credentials are provisioned. The shape of
 * the return value is fixed by the `inferred_signal_calendar` schema.
 */
function fetchCalendarEvents(_ownerId: string, asOf: Date): Promise<RawCalendarEvent[]> {
  console.warn(
    "[sync-calendar] FAKE FETCHER — replace with Google OAuth fetcher",
  );
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const base = asOf.getTime();
  const iso = (offsetMs: number) => new Date(base + offsetMs).toISOString();

  return Promise.resolve([
    {
      id: "demo-standup",
      title: "Team standup",
      start: iso(1 * day + 9 * hour),
      end: iso(1 * day + 9.5 * hour),
      isAllDay: false,
    },
    {
      id: "demo-coffee",
      title: "Coffee with Sam",
      start: iso(2 * day + 15 * hour),
      end: iso(2 * day + 16 * hour),
      isAllDay: false,
    },
    {
      id: "demo-focus",
      title: "Deep work block",
      start: iso(3 * day + 9 * hour),
      end: iso(3 * day + 12 * hour),
      isAllDay: false,
    },
  ]);
}

async function collectForOwner(
  supabase: any,
  ownerId: string,
  asOf: Date,
): Promise<CalendarCollectionSummary> {
  const events = await fetchCalendarEvents(ownerId, asOf);

  if (events.length > 0) {
    const rows = events.map((e) => ({
      owner_id: ownerId,
      event_id: e.id,
      title: e.title ?? null,
      start: e.start,
      end: e.end,
      is_all_day: e.isAllDay,
    }));
    const { error } = await supabase
      .from("inferred_signal_calendar")
      .upsert(rows, { onConflict: "owner_id,event_id" });
    if (error) throw error;
  }

  const keepList = events.map((e) => e.id).join(",");
  const { error: delErr } = await supabase
    .from("inferred_signal_calendar")
    .delete()
    .eq("owner_id", ownerId)
    .not("event_id", "in", `(${keepList})`);
  if (delErr) throw delErr;

  const windowEnd = new Date(asOf);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + WINDOW_DAYS);

  return {
    ownerId,
    eventsWritten: events.length,
    windowEnd: windowEnd.toISOString(),
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CALENDAR_PROVIDER = Deno.env.get("CALENDAR_PROVIDER") ?? "fake";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn(
    "[sync-calendar] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — function will fail on invocation",
  );
}

if (CALENDAR_PROVIDER !== "fake") {
  console.warn(
    `[sync-calendar] CALENDAR_PROVIDER=${CALENDAR_PROVIDER} but no OAuth fetcher is wired yet — falling back to fake`,
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: SyncRequest = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const asOf = body.asOf ? new Date(body.asOf) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    return new Response(JSON.stringify({ error: "invalid asOf" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "");

  try {
    const summaries: CalendarCollectionSummary[] = [];

    if (body.ownerId) {
      summaries.push(await collectForOwner(supabase, body.ownerId, asOf));
    } else {
      // Iterate over every authenticated User. When the OAuth state
      // table lands ("calendars connected per User"), filter to only
      // Users who've actually connected a calendar.
      const { data: users, error } = await supabase
        .from("auth.users")
        .select("id");
      if (error) {
        // auth.users isn't always queryable via PostgREST; fall back to a
        // best-effort RPC. If neither path is wired, surface a clear error.
        return new Response(
          JSON.stringify({
            error:
              "no ownerId provided and auth.users isn't reachable from this function — pass body.ownerId or wire a list_calendar_users RPC",
            providerHint: CALENDAR_PROVIDER,
          }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
      for (const u of users ?? []) {
        summaries.push(await collectForOwner(supabase, u.id as string, asOf));
      }
    }

    return new Response(
      JSON.stringify({ provider: CALENDAR_PROVIDER, summaries }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
