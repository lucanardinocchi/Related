// sync-sleep Edge Function — daily ingestion of HealthKit Sleep records
// into `inferred_signal_sleep`. Same pattern as a calendar sync would
// take: pg_cron POSTs once per User per day, the function calls a
// SleepFetcher and upserts via the collector contract.
//
// SCAFFOLDING: today this function uses the FakeSleepFetcher because
// the real HealthKit fetcher requires a native iOS module (Expo
// config plugin + Swift bridge) that has to be added on a Mac with
// Xcode. The fake keeps the cron, the auth path, and the persistence
// layer testable end-to-end. When the native module ships, the only
// change here is the `fetcher` line below.
//
// Deploy:
//   supabase functions deploy sync-sleep --no-verify-jwt=false
//
// Runtime: Deno (Supabase Edge Runtime).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@^2.46.1";

interface RawSleepRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  quality: string | null;
}

interface SyncSleepRequest {
  ownerId?: string;
  asOf?: string;
}

// ---------------------------------------------------------------------------
// FAKE FETCHER — replace with iOS HealthKit fetcher once the Expo
// config plugin lands. The contract is: given an `asOf` Date, return
// the User's last-3-days sleep records. The collector handles the
// rest (upsert + GC + idempotency on (owner_id, record_id)).
// ---------------------------------------------------------------------------
async function fakeFetcher(_asOf: Date): Promise<RawSleepRecord[]> {
  console.warn(
    "[sync-sleep] FAKE FETCHER — replace with iOS HealthKit fetcher once the Expo config plugin lands.",
  );
  return [];
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "[sync-sleep] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — function will fail at request time.",
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: SyncSleepRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const ownerId = body.ownerId;
  if (!ownerId) {
    return new Response(
      JSON.stringify({ error: "missing `ownerId`" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const asOf = body.asOf ? new Date(body.asOf) : new Date();

  try {
    const supabase = createClient(supabaseUrl!, serviceRoleKey!);
    const records = await fakeFetcher(asOf);

    if (records.length > 0) {
      const rows = records.map((r) => ({
        owner_id: ownerId,
        record_id: r.id,
        started_at: r.startedAt,
        ended_at: r.endedAt,
        duration_minutes: r.durationMinutes,
        quality: r.quality,
      }));
      const { error: upErr } = await (supabase as any)
        .from("inferred_signal_sleep")
        .upsert(rows, { onConflict: "owner_id,record_id" });
      if (upErr) throw upErr;
    }

    const keepList = records.map((r) => r.id).join(",");
    const { error: delErr } = await (supabase as any)
      .from("inferred_signal_sleep")
      .delete()
      .eq("owner_id", ownerId)
      .not("record_id", "in", `(${keepList})`);
    if (delErr) throw delErr;

    return new Response(
      JSON.stringify({ recordsWritten: records.length }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
});
