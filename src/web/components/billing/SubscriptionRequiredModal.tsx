"use client";

import { useEffect, useState } from "react";
import { SUBSCRIPTION_PRICE_LABEL } from "@related/shared";
import { Button, Modal } from "@/components/ui";
import { createCheckoutSession } from "@/lib/billing/stripeClient";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SubscriptionRequiredModal({ open, onClose }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    if (!open) {
      setError(null);
      setWorking(false);
    }
  }, [open]);

  async function handleSubscribe() {
    setWorking(true);
    setError(null);
    try {
      const { url } = await createCheckoutSession({
        successUrl: `${origin}/settings/billing/success`,
        cancelUrl: `${origin}/settings`,
      });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setWorking(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Subscription required"
      subtitle="Your free trial has ended. Subscribe to keep Ambient Intelligence running in the background."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={working}>
            Not now
          </Button>
          <Button type="button" onClick={() => void handleSubscribe()} disabled={working}>
            {working ? "Redirecting…" : `Subscribe — ${SUBSCRIPTION_PRICE_LABEL}`}
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-[22px] text-fg-subtle">
        Related&apos;s background agent processes your relationship context on a
        schedule and when new activity arrives, then recommends actions you can
        accept or decline. Subscribe to continue after your free trial.
      </p>
      {error && (
        <p className="mt-3 text-[13px] text-red-600" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
