// whatsapp-oauth Edge Function — exchange Meta OAuth code for tokens and
// persist WhatsApp Business phone number credentials to user_provider_tokens.
//
// Deploy:
//   supabase secrets set WHATSAPP_APP_ID=...
//   supabase secrets set WHATSAPP_APP_SECRET=...
//   supabase functions deploy whatsapp-oauth
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const WHATSAPP_SCOPES =
  "whatsapp_business_management,whatsapp_business_messaging,business_management";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_ID = Deno.env.get("WHATSAPP_APP_ID");
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const params = new URLSearchParams({
    client_id: APP_ID ?? "",
    client_secret: APP_SECRET ?? "",
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetch(
    `${GRAPH_API}/oauth/access_token?${params.toString()}`,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `WhatsApp token exchange failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("WhatsApp token exchange returned no access_token");
  }
  return {
    accessToken: data.access_token as string,
    expiresInSeconds: data.expires_in ?? 3600,
  };
}

async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: APP_ID ?? "",
    client_secret: APP_SECRET ?? "",
    fb_exchange_token: shortLivedToken,
  });
  const response = await fetch(
    `${GRAPH_API}/oauth/access_token?${params.toString()}`,
  );
  if (!response.ok) {
    return { accessToken: shortLivedToken, expiresInSeconds: 3600 };
  }
  const data = await response.json();
  return {
    accessToken: (data.access_token as string) ?? shortLivedToken,
    expiresInSeconds: data.expires_in ?? 60 * 24 * 60 * 60,
  };
}

async function graphGet(
  accessToken: string,
  path: string,
): Promise<Record<string, unknown>> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(
    `${GRAPH_API}${path}${separator}access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Graph API ${path} failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  return await response.json();
}

async function resolvePhoneNumberId(
  accessToken: string,
): Promise<{ phoneNumberId: string; wabaId: string | null }> {
  const businesses = await graphGet(accessToken, "/me/businesses?fields=id,name");
  const businessList = (businesses.data ?? []) as Array<{ id: string }>;

  for (const business of businessList) {
    const wabaResponse = await graphGet(
      accessToken,
      `/${business.id}/owned_whatsapp_business_accounts?fields=id,name`,
    );
    const wabaList = (wabaResponse.data ?? []) as Array<{ id: string }>;
    for (const waba of wabaList) {
      const phones = await graphGet(
        accessToken,
        `/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name`,
      );
      const phoneList = (phones.data ?? []) as Array<{ id: string }>;
      if (phoneList.length > 0) {
        return { phoneNumberId: phoneList[0]!.id, wabaId: waba.id };
      }
    }
  }

  throw new Error(
    "No WhatsApp Business phone number found — complete Meta Embedded Signup or add a phone number to your WABA.",
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  if (!APP_ID || !APP_SECRET) {
    return jsonResponse(500, {
      error: "WhatsApp app credentials not configured",
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing Authorization header" });
  }

  let body: { code?: string; redirectUri?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  if (!body.code || !body.redirectUri) {
    return jsonResponse(400, { error: "missing code or redirectUri" });
  }

  const userClient = createClient(
    SUPABASE_URL ?? "",
    SUPABASE_ANON_KEY ?? "",
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  const userRes = await userClient.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonResponse(401, { error: "auth failed" });
  }
  const ownerId = userRes.data.user.id;

  try {
    const short = await exchangeCodeForToken(body.code, body.redirectUri);
    const long = await exchangeForLongLivedToken(short.accessToken);
    const { phoneNumberId, wabaId } = await resolvePhoneNumberId(
      long.accessToken,
    );
    const expiresAt = new Date(
      Date.now() + long.expiresInSeconds * 1000,
    ).toISOString();

    const adminClient = createClient(
      SUPABASE_URL ?? "",
      SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } },
    );

    const { error: upsertError } = await adminClient
      .from("user_provider_tokens")
      .upsert(
        {
          owner_id: ownerId,
          provider: "whatsapp",
          access_token: long.accessToken,
          refresh_token: wabaId,
          expires_at: expiresAt,
          scopes: WHATSAPP_SCOPES,
          provider_account_id: phoneNumberId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,provider" },
      );

    if (upsertError) {
      return jsonResponse(500, { error: upsertError.message });
    }

    return jsonResponse(200, { status: "ok", phoneNumberId, wabaId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(502, { status: "error", error: message });
  }
});
