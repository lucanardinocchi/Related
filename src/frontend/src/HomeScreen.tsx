import { useEffect, useState } from "react";
import type {
  ClosedPerDayBucket,
  Interaction,
  InteractionsClient,
  OpenThread,
  OpenThreadsClient,
} from "@related/shared";
import { Home } from "./Home";

export interface HomeScreenProps {
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
  onSignOut: () => void;
}

/** Format a Date as YYYY-MM-DD in UTC. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build the 60-day inclusive UTC window ending today. The Home graph card
 * splits this 30/30 for total + prior delta.
 */
function buildClosedPerDayWindow(): { from: string; to: string } {
  const today = new Date(Date.now());
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 59);
  return { from: isoDate(from), to: isoDate(today) };
}

export function HomeScreen({
  openThreadsClient,
  interactionsClient,
  onSignOut,
}: HomeScreenProps) {
  const [openThreads, setOpenThreads] = useState<OpenThread[]>([]);
  const [closedPerDay, setClosedPerDay] = useState<ClosedPerDayBucket[]>([]);
  const [upcoming, setUpcoming] = useState<Interaction[]>([]);

  useEffect(() => {
    let cancelled = false;
    const window = buildClosedPerDayWindow();
    // Loads are independent — if one fails we still show whatever did load.
    // Failures are silent in the UI (Home renders empty states); the user
    // can retry by re-navigating to the tab.
    openThreadsClient
      .listOpenForUser()
      .then((threads) => {
        if (!cancelled) setOpenThreads(threads);
      })
      .catch(() => {});
    openThreadsClient
      .closedPerDay(window)
      .then((buckets) => {
        if (!cancelled) setClosedPerDay(buckets);
      })
      .catch(() => {});
    interactionsClient
      .listUpcomingPlanned()
      .then((next) => {
        if (!cancelled) setUpcoming(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [openThreadsClient, interactionsClient]);

  return (
    <Home
      openThreads={openThreads}
      upcomingInteractions={upcoming}
      closedPerDayLast60={closedPerDay}
      onSignOut={onSignOut}
    />
  );
}
