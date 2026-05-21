// stripe-portal — Stripe Customer Portal for manage/cancel subscription.
//
// Deploy:
//   supabase secrets set STRIPE_SECRET_KEY=sk_...
//   supabase functions deploy stripe-portal
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

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
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  if (!STRIPE_SECRET_KEY) {
    return jsonResponse(500, { error: "Stripe not configured" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing Authorization header" });
  }

  let body: { returnUrl?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  if (!body.returnUrl) {
    return jsonResponse(400, { error: "missing returnUrl" });
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

  const { data: sub } = await userClient
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return jsonResponse(400, { error: "no billing account" });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-11-20.acacia",
  });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: body.returnUrl,
    });
    return jsonResponse(200, { url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "portal failed";
    return jsonResponse(500, { error: message });
  }
});
