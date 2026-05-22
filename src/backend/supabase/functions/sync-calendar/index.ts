// Calendar sync — backfill (1yr history + upcoming) and optional push subscriptions.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { syncOwnerCalendarProvider, type TokenRow } from "../_shared/calendarSyncEngine.ts";
import { BROWSER_INVOKE_CORS_HEADERS, browserInvokeOptionsResponse } from "../_shared/browserInvokeCors.ts";

type CalendarProvider = "google" | "outlook";
interface SyncRequest { ownerId?: string; subscribe?: boolean; }
const CALENDAR_PROVIDERS: CalendarProvider[] = ["google", "outlook"];
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");

function clientCredsForProvider(provider: CalendarProvider) {
  return provider === "google"
    ? { clientId: GOOGLE_CLIENT_ID ?? "", clientSecret: GOOGLE_CLIENT_SECRET ?? "" }
    : { clientId: MICROSOFT_CLIENT_ID ?? "", clientSecret: MICROSOFT_CLIENT_SECRET ?? "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return browserInvokeOptionsResponse();
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...BROWSER_INVOKE_CORS_HEADERS, "content-type": "application/json" } });
  }
  let body: SyncRequest = {};
  try { const text = await req.text(); if (text) body = JSON.parse(text); } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400, headers: { ...BROWSER_INVOKE_CORS_HEADERS, "content-type": "application/json" } });
  }
  const supabase = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "");
  const webhookBaseUrl = (SUPABASE_URL ?? "").replace(/\/$/, "");
  try {
    let query = supabase.from("user_provider_tokens").select("owner_id, provider, access_token, refresh_token, scopes").in("provider", CALENDAR_PROVIDERS);
    if (body.ownerId) query = query.eq("owner_id", body.ownerId);
    const { data, error } = await query;
    if (error) throw error;
    const summaries = [];
    for (const t of (data ?? []) as Array<TokenRow & { provider: CalendarProvider }>) {
      const creds = clientCredsForProvider(t.provider);
      summaries.push(await syncOwnerCalendarProvider(supabase, t.provider, t, creds.clientId, creds.clientSecret, { subscribe: body.subscribe === true, webhookBaseUrl }));
    }
    return new Response(JSON.stringify({ summaries }), { headers: { ...BROWSER_INVOKE_CORS_HEADERS, "content-type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...BROWSER_INVOKE_CORS_HEADERS, "content-type": "application/json" } });
  }
});
