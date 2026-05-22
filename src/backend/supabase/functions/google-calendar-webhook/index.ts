// google-calendar-webhook — Google Calendar push notifications (events.watch).
//
// Deploy: supabase functions deploy google-calendar-webhook --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { handleGoogleCalendarPush } from "../_shared/calendarSyncEngine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  const channelId = req.headers.get("X-Goog-Channel-ID");
  const resourceState = req.headers.get("X-Goog-Resource-State") ?? "";

  if (!channelId) {
    return new Response("missing channel", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "");

  try {
    await handleGoogleCalendarPush(
      supabase,
      channelId,
      resourceState,
      GOOGLE_CLIENT_ID ?? "",
      GOOGLE_CLIENT_SECRET ?? "",
    );
  } catch (err) {
    console.error("[google-calendar-webhook]", err);
  }

  return new Response("ok", { status: 200 });
});
