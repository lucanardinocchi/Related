// stripe-webhook — Stripe subscription lifecycle events → user_subscriptions.
//
// Deploy:
//   supabase secrets set STRIPE_SECRET_KEY=sk_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// Stripe Dashboard → Webhooks:
//   URL: https://<ref>.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted, invoice.payment_failed
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

async function recordEventIfNew(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
): Promise<boolean> {
  const { error } = await supabase.from("stripe_webhook_events").insert({
    event_id: eventId,
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function resolveOwnerId(
  supabase: ReturnType<typeof createClient>,
  metadata: Stripe.Metadata | null | undefined,
  clientReferenceId: string | null | undefined,
  customerId: string | null | undefined,
): Promise<string | null> {
  if (metadata?.owner_id) return String(metadata.owner_id);
  if (clientReferenceId) return clientReferenceId;
  if (!customerId) return null;
  const { data } = await supabase
    .from("user_subscriptions")
    .select("owner_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.owner_id ?? null;
}

async function upsertSubscription(
  supabase: ReturnType<typeof createClient>,
  input: {
    ownerId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    status: string;
    priceId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  },
): Promise<void> {
  const { error } = await supabase.from("user_subscriptions").upsert(
    {
      owner_id: input.ownerId,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
      status: input.status,
      price_id: input.priceId,
      current_period_end: input.currentPeriodEnd,
      cancel_at_period_end: input.cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" },
  );
  if (error) throw error;
}

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const ownerId = await resolveOwnerId(
    supabase,
    session.metadata,
    session.client_reference_id,
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null,
  );
  if (!ownerId) return;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  if (!customerId) return;

  let subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  let status = "active";
  let priceId: string | null = null;
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;

  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    status = sub.status;
    priceId = sub.items.data[0]?.price?.id ?? null;
    currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
    cancelAtPeriodEnd = sub.cancel_at_period_end;
  }

  await upsertSubscription(supabase, {
    ownerId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    status,
    priceId,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  });
}

async function handleSubscriptionChange(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
): Promise<void> {
  const ownerId = await resolveOwnerId(
    supabase,
    subscription.metadata,
    null,
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null,
  );
  if (!ownerId) return;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) return;

  await upsertSubscription(supabase, {
    ownerId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    priceId: subscription.items.data[0]?.price?.id ?? null,
    currentPeriodEnd: new Date(
      subscription.current_period_end * 1000,
    ).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return new Response("Stripe not configured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const body = await req.text();
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-11-20.acacia",
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const adminClient = createClient(
    SUPABASE_URL ?? "",
    SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const isNew = await recordEventIfNew(adminClient, event.id);
    if (!isNew) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          adminClient,
          stripe,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(
          adminClient,
          event.data.object as Stripe.Subscription,
        );
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await handleSubscriptionChange(adminClient, sub);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("stripe-webhook error:", err);
    return new Response("Webhook handler failed", { status: 500 });
  }
});
