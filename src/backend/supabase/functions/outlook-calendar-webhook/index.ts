// outlook-calendar-webhook — Microsoft Graph calendar change notifications.
//
// Deploy: supabase functions deploy outlook-calendar-webhook --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  handleOutlookCalendarPush,
  extractOutlookEventId,
  parseClientStateOwnerId,
} from "../_shared/calendarSyncEngine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  let payload: {
    value?: Array<{
      changeType?: string;
      clientState?: string;
      resource?: string;
      resourceData?: { id?: string };
    }>;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "");

  for (const item of payload.value ?? []) {
    const ownerId = parseClientStateOwnerId(item.clientState ?? null);
    if (!ownerId) continue;

    const eventId = extractOutlookEventId(
      item.resource ?? "",
      item.resourceData,
    );
    if (!eventId) continue;

    const changeType = item.changeType ?? "updated";

    try {
      await handleOutlookCalendarPush(
        supabase,
        ownerId,
        changeType,
        eventId,
        MICROSOFT_CLIENT_ID ?? "",
        MICROSOFT_CLIENT_SECRET ?? "",
      );
    } catch (err) {
      console.error("[outlook-calendar-webhook]", err);
    }
  }

  return new Response("ok", { status: 202 });
});
