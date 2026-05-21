"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  canRunAmbientIntelligence,
  hasShownAmbientBillingModalThisSession,
  markAmbientBillingModalShownThisSession,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { SubscriptionRequiredModal } from "./SubscriptionRequiredModal";

interface AmbientBillingContextValue {
  /**
   * Call before running a baseline or triggered Pass. Returns true when the
   * User may proceed; otherwise opens the subscription modal (once per
   * session) and returns false.
   */
  requestAmbientAccess: () => Promise<boolean>;
  /** True after the User dismissed the modal or was prompted this session. */
  isAmbientBillingBlocked: () => boolean;
}

const AmbientBillingContext = createContext<AmbientBillingContextValue | null>(
  null,
);

export function AmbientBillingProvider({ children }: { children: ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const promptedRef = useRef(hasShownAmbientBillingModalThisSession());

  const dismissModal = useCallback(() => {
    promptedRef.current = true;
    markAmbientBillingModalShownThisSession();
    setModalOpen(false);
  }, []);

  const requestAmbientAccess = useCallback(async (): Promise<boolean> => {
    const { subscriptions } = getBrowserDeps();
    const state = await subscriptions.getState();
    if (canRunAmbientIntelligence(state)) {
      promptedRef.current = false;
      return true;
    }

    if (
      promptedRef.current ||
      hasShownAmbientBillingModalThisSession()
    ) {
      promptedRef.current = true;
      return false;
    }

    promptedRef.current = true;
    markAmbientBillingModalShownThisSession();
    setModalOpen(true);
    return false;
  }, []);

  const isAmbientBillingBlocked = useCallback(
    () =>
      promptedRef.current || hasShownAmbientBillingModalThisSession(),
    [],
  );

  const value = useMemo(
    () => ({ requestAmbientAccess, isAmbientBillingBlocked }),
    [requestAmbientAccess, isAmbientBillingBlocked],
  );

  return (
    <AmbientBillingContext.Provider value={value}>
      {children}
      <SubscriptionRequiredModal open={modalOpen} onClose={dismissModal} />
    </AmbientBillingContext.Provider>
  );
}

export function useAmbientBilling(): AmbientBillingContextValue {
  const ctx = useContext(AmbientBillingContext);
  if (!ctx) {
    throw new Error("useAmbientBilling must be used within AmbientBillingProvider");
  }
  return ctx;
}
