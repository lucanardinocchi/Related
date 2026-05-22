// stripe-checkout — create a Stripe Checkout Session for $29/month subscription.
//
// Deploy:
//   supabase secrets set STRIPE_SECRET_KEY=sk_...
//   supabase secrets set STRIPE_PRICE_ID=price_...
//   supabase functions deploy stripe-checkout
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID");

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

  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    return jsonResponse(500, { error: "Stripe not configured" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing Authorization header" });
  }

  let body: { successUrl?: string; cancelUrl?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  if (!body.successUrl || !body.cancelUrl) {
    return jsonResponse(400, { error: "missing successUrl or cancelUrl" });
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
  const email = userRes.data.user.email ?? undefined;

  const { data: existing } = await userClient
    .from("user_subscriptions")
    .select("stripe_customer_id, status")
    .maybeSingle();

  if (
    existing?.status === "active" || existing?.status === "trialing"
  ) {
    return jsonResponse(400, { error: "subscription already active" });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-11-20.acacia",
  });

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
    client_reference_id: ownerId,
    metadata: { owner_id: ownerId },
    subscription_data: {
      metadata: { owner_id: ownerId },
    },
    allow_promotion_codes: true,
  };

  if (email) {
    sessionParams.customer_email = email;
  }
  if (existing?.stripe_customer_id) {
    sessionParams.customer = existing.stripe_customer_id;
    delete sessionParams.customer_email;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    if (!session.url) {
      return jsonResponse(500, { error: "checkout session missing url" });
    }
    return jsonResponse(200, { url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "checkout failed";
    return jsonResponse(500, { error: message });
  }
});
