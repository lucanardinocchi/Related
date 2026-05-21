import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

function requireStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in src/web/.env.local",
    );
  }
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

function requirePriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error(
      "Stripe price is not configured. Set STRIPE_PRICE_ID in src/web/.env.local",
    );
  }
  return priceId;
}

export async function createCheckoutSessionForUser(
  supabase: SupabaseClient,
  input: { successUrl: string; cancelUrl: string },
): Promise<{ url: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: existing } = await supabase
    .from("user_subscriptions")
    .select("stripe_customer_id, status")
    .maybeSingle();

  if (
    existing?.status === "active" ||
    existing?.status === "trialing"
  ) {
    throw new Error("subscription already active");
  }

  const stripe = requireStripe();
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: requirePriceId(), quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: user.id,
    metadata: { owner_id: user.id },
    subscription_data: {
      metadata: { owner_id: user.id },
    },
    allow_promotion_codes: true,
  };

  if (user.email) {
    sessionParams.customer_email = user.email;
  }
  if (existing?.stripe_customer_id) {
    sessionParams.customer = existing.stripe_customer_id;
    delete sessionParams.customer_email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  if (!session.url) {
    throw new Error("checkout session missing url");
  }
  return { url: session.url };
}

export async function createPortalSessionForUser(
  supabase: SupabaseClient,
  input: { returnUrl: string },
): Promise<{ url: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: sub } = await supabase
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    throw new Error("no billing account");
  }

  const stripe = requireStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: input.returnUrl,
  });
  return { url: session.url };
}
