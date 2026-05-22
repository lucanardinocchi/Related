"use client";

import { useEffect } from "react";
import { AmbientIntelligenceClient } from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { useAmbientBilling } from "@/components/billing/AmbientBillingProvider";

const BILLING_CHECK_INTERVAL_MS = 60_000;

/**
 * Prompts unsubscribed Users when pending ambient work exists. Baseline and
 * triggered pass dispatch runs server-side (pg_cron → ambient-dispatch).
 */
export function AmbientIntelligenceRunner() {
  const { requestAmbientAccess, isAmbientBillingBlocked } = useAmbientBilling();

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (cancelled) return;

      const { supabase } = getBrowserDeps();
      const ambient = new AmbientIntelligenceClient(supabase);
      const subscribed = await ambient.hasActiveSubscription();
      if (subscribed || isAmbientBillingBlocked()) {
        return;
      }

      const pending = await ambient.listPendingPasses(1);
      if (pending.length > 0) {
        await requestAmbientAccess();
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), BILLING_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [requestAmbientAccess, isAmbientBillingBlocked]);

  return null;
}
