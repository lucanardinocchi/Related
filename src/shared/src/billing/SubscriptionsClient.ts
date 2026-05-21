import type { SupabaseClient } from "@supabase/supabase-js";

/** Display price — must match the Stripe Price configured in dashboard. */
export const SUBSCRIPTION_PRICE_LABEL = "$29/month";

export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "inactive";

export interface SubscriptionState {
  status: SubscriptionStatus;
  isActive: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

interface SubscriptionRow {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

export function isActiveSubscriptionStatus(
  status: string | null | undefined,
): boolean {
  return (
    status !== null &&
    status !== undefined &&
    (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * Reads subscription status and creates Stripe Checkout / Portal sessions
 * via Edge Functions (stripe-checkout, stripe-portal).
 */
export class SubscriptionsClient {
  constructor(private readonly client: SupabaseClient) {}

  async getState(): Promise<SubscriptionState> {
    const { data, error } = await this.client
      .from("user_subscriptions")
      .select("status, current_period_end, cancel_at_period_end, stripe_customer_id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        status: "inactive",
        isActive: false,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        stripeCustomerId: null,
      };
    }
    const row = data as SubscriptionRow;
    const status = (row.status || "inactive") as SubscriptionStatus;
    return {
      status,
      isActive: isActiveSubscriptionStatus(status),
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      stripeCustomerId: row.stripe_customer_id,
    };
  }

  async createCheckoutSession(input: {
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }> {
    const { data, error } = await this.client.functions.invoke(
      "stripe-checkout",
      { body: input },
    );
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "stripe-checkout failed";
      throw new Error(errMsg);
    }
    const result = (data ?? {}) as { url?: string; error?: string };
    if (!result.url) {
      throw new Error(result.error ?? "Checkout session missing url");
    }
    return { url: result.url };
  }

  async createPortalSession(input: {
    returnUrl: string;
  }): Promise<{ url: string }> {
    const { data, error } = await this.client.functions.invoke("stripe-portal", {
      body: input,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "stripe-portal failed";
      throw new Error(errMsg);
    }
    const result = (data ?? {}) as { url?: string; error?: string };
    if (!result.url) {
      throw new Error(result.error ?? "Portal session missing url");
    }
    return { url: result.url };
  }
}
