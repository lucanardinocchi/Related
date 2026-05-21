"use client";

import { useEffect, useRef } from "react";
import { AmbientIntelligenceClient } from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { useAmbientBilling } from "@/components/billing/AmbientBillingProvider";

const POLL_INTERVAL_MS = 30_000;

/**
 * Drains baseline/triggered passes only for subscribed Users. Without a
 * subscription, ambient passes are not run; the billing modal opens at most
 * once per browser session when pending work exists.
 */
export function AmbientIntelligenceRunner() {
  const { requestAmbientAccess, isAmbientBillingBlocked } = useAmbientBilling();
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (runningRef.current || cancelled) return;

      const { supabase } = getBrowserDeps();
      const ambient = new AmbientIntelligenceClient(supabase);
      const subscribed = await ambient.hasActiveSubscription();

      if (!subscribed) {
        if (isAmbientBillingBlocked()) {
          return;
        }
        const pending = await ambient.listPendingPasses(1);
        if (pending.length > 0) {
          await requestAmbientAccess();
        }
        return;
      }

      const pending = await ambient.listPendingPasses(1);
      if (pending.length === 0 || cancelled) return;

      runningRef.current = true;
      try {
        await ambient.dispatchNextPendingPass();
      } catch (err) {
        console.error("Ambient Intelligence dispatch failed:", err);
      } finally {
        runningRef.current = false;
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [requestAmbientAccess, isAmbientBillingBlocked]);

  return null;
}
