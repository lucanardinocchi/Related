// calendar-renew-subscriptions — renew expiring Google/Outlook calendar watches.
//
// Deploy: supabase functions deploy calendar-renew-subscriptions

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { renewExpiringSubscriptions } from "../_shared/calendarSyncEngine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "");
  const webhookBaseUrl = (SUPABASE_URL ?? "").replace(/\/$/, "");

  const result = await renewExpiringSubscriptions(
    supabase,
    webhookBaseUrl,
    GOOGLE_CLIENT_ID ?? "",
    GOOGLE_CLIENT_SECRET ?? "",
    MICROSOFT_CLIENT_ID ?? "",
    MICROSOFT_CLIENT_SECRET ?? "",
  );

  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
});
