// ambient-dispatch — drains one baseline/triggered pass per invocation using
// service role. Invoked by pg_cron (`dispatch_ambient_passes`) or manually.
//
// Deploy:
//   supabase functions deploy ambient-dispatch
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { drainAmbientPasses } from "../_shared/ambientDispatch.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  let body: { drain?: boolean; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body defaults to one pass per invocation.
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: "missing Supabase service configuration" });
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const limit = body.drain ? Math.min(body.limit ?? 10, 50) : 1;
  const results = await drainAmbientPasses(
    service,
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    limit,
  );

  return jsonResponse(200, {
    status: "ok",
    processed: results.length,
    results,
  });
});
