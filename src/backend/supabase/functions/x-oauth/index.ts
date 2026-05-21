// x-oauth Edge Function — exchange X OAuth 2.0 PKCE code for tokens and
// persist to user_provider_tokens.
//
// Deploy:
//   supabase secrets set X_CLIENT_ID=...
//   supabase secrets set X_CLIENT_SECRET=...
//   supabase functions deploy x-oauth
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const X_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const X_API = "https://api.twitter.com/2";
const X_SCOPES =
  "dm.read dm.write users.read tweet.read offline.access";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CLIENT_ID = Deno.env.get("X_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("X_CLIENT_SECRET");

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

async function exchangeCodeForTokens(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
}> {
  const body = new URLSearchParams({
    code: input.code,
    grant_type: "authorization_code",
    client_id: CLIENT_ID ?? "",
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
  });

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (CLIENT_SECRET) {
    headers.authorization =
      `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;
  }

  const response = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `X token exchange failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("X token exchange returned no access_token");
  }

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? null,
    expiresInSeconds: data.expires_in ?? 7200,
  };
}

async function fetchXAccountId(accessToken: string): Promise<string> {
  const response = await fetch(`${X_API}/users/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `X /users/me failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  const data = await response.json();
  const accountId = data.data?.id;
  if (!accountId) {
    throw new Error("X /users/me returned no user id");
  }
  return String(accountId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  if (!CLIENT_ID) {
    return jsonResponse(500, { error: "X client credentials not configured" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing Authorization header" });
  }

  let body: { code?: string; redirectUri?: string; codeVerifier?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  if (!body.code || !body.redirectUri || !body.codeVerifier) {
    return jsonResponse(400, {
      error: "missing code, redirectUri, or codeVerifier",
    });
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
    const tokens = await exchangeCodeForTokens({
      code: body.code,
      redirectUri: body.redirectUri,
      codeVerifier: body.codeVerifier,
    });
    const accountId = await fetchXAccountId(tokens.accessToken);
    const expiresAt = new Date(
      Date.now() + tokens.expiresInSeconds * 1000,
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
          provider: "x",
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_at: expiresAt,
          scopes: X_SCOPES,
          provider_account_id: accountId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,provider" },
      );

    if (upsertError) {
      return jsonResponse(500, { error: upsertError.message });
    }

    return jsonResponse(200, { status: "ok", accountId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(502, { status: "error", error: message });
  }
});
