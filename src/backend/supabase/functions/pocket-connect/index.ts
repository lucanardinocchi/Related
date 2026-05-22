// pocket-connect Edge Function — validate Pocket API key, fetch account
// display name, persist token + pocket_integration row.
//
// Deploy:
//   supabase functions deploy pocket-connect
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const POCKET_API = "https://public.heypocketai.com/api/v1/public";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

async function pocketGet(
  apiKey: string,
  path: string,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const response = await fetch(`${POCKET_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const err = typeof json.error === "string"
      ? json.error
      : `Pocket API ${response.status}`;
    return { ok: false, status: response.status, error: err };
  }
  if (json.success === false) {
    return {
      ok: false,
      status: 401,
      error: typeof json.error === "string" ? json.error : "Pocket API request failed",
    };
  }
  return { ok: true, json };
}

function pickString(data: unknown, keys: string[]): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  const profile = obj.profile;
  if (profile && typeof profile === "object") {
    return pickString(profile, keys);
  }
  return null;
}

function pickDisplayName(data: unknown): string | null {
  return pickString(data, [
    "display_name",
    "displayName",
    "name",
    "full_name",
    "fullName",
  ]);
}

interface PocketProfile {
  displayName: string | null;
  userId: string | null;
  email: string | null;
}

async function fetchPocketProfile(apiKey: string): Promise<PocketProfile> {
  const paths = ["/users/me", "/me", "/account", "/profile"];
  for (const path of paths) {
    const result = await pocketGet(apiKey, path);
    if (!result.ok) continue;
    const data = result.json.data ?? result.json;
    return {
      displayName: pickDisplayName(data),
      userId: pickString(data, ["id", "user_id", "userId"]),
      email: pickString(data, ["email"]),
    };
  }
  return { displayName: null, userId: null, email: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return jsonResponse(405, { error: "method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(401, { error: "missing Authorization header" });

  let body: {
    apiKey?: string;
    accountDisplayName?: string;
    webhookSecret?: string;
    action?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonResponse(401, { error: "auth failed" });
  }
  const ownerId = userRes.data.user.id;

  if (body.action === "updateWebhook") {
    const webhookSecret = body.webhookSecret?.trim();
    if (!webhookSecret) {
      return jsonResponse(400, { error: "missing webhookSecret" });
    }
    const service = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "", {
      auth: { persistSession: false },
    });
    const { error } = await service
      .from("pocket_integration")
      .update({
        webhook_secret: webhookSecret,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId);
    if (error) return jsonResponse(500, { error: error.message });
    return jsonResponse(200, { status: "ok" });
  }

  if (body.action === "disconnect") {
    const service = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "", {
      auth: { persistSession: false },
    });
    await service.from("user_provider_tokens").delete().eq("owner_id", ownerId).eq("provider", "pocket");
    await service.from("pocket_integration").delete().eq("owner_id", ownerId);
    await service.from("pocket_pending_imports").delete().eq("owner_id", ownerId);
    return jsonResponse(200, { status: "ok" });
  }

  const apiKey = body.apiKey?.trim();
  if (!apiKey || !apiKey.startsWith("pk_")) {
    return jsonResponse(400, {
      error: "invalid apiKey — Pocket API keys start with pk_",
    });
  }

  const validate = await pocketGet(apiKey, "/tags");
  if (!validate.ok) {
    return jsonResponse(401, { error: validate.error });
  }

  const profile = await fetchPocketProfile(apiKey);
  let accountDisplayName = body.accountDisplayName?.trim() ?? profile.displayName;
  if (!accountDisplayName) {
    return jsonResponse(422, {
      error: "could_not_resolve_account_name",
      message:
        "Could not read your Pocket account name from the API. Enter the name Pocket uses as your speaker label in recordings.",
    });
  }

  const userEmail = userRes.data.user.email?.toLowerCase() ?? null;
  const pocketUserEmail = profile.email?.toLowerCase() ?? userEmail;
  const webhookSecret = body.webhookSecret?.trim() || null;

  const connectedAt = new Date().toISOString();
  const service = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });

  const { error: tokenError } = await service.from("user_provider_tokens").upsert(
    {
      owner_id: ownerId,
      provider: "pocket",
      access_token: apiKey,
      refresh_token: null,
      expires_at: null,
      scopes: null,
      provider_account_id: accountDisplayName,
      updated_at: connectedAt,
    },
    { onConflict: "owner_id,provider" },
  );
  if (tokenError) {
    return jsonResponse(500, { error: tokenError.message });
  }

  const { error: integrationError } = await service.from("pocket_integration").upsert(
    {
      owner_id: ownerId,
      account_display_name: accountDisplayName,
      pocket_user_id: profile.userId,
      pocket_user_email: pocketUserEmail,
      webhook_secret: webhookSecret,
      connected_at: connectedAt,
      updated_at: connectedAt,
    },
    { onConflict: "owner_id" },
  );
  if (integrationError) {
    return jsonResponse(500, { error: integrationError.message });
  }

  return jsonResponse(200, {
    status: "ok",
    accountDisplayName,
    connectedAt,
  });
});
