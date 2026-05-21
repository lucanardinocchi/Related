import { getServerDeps } from "@/lib/deps/server";
import { calendarAnalytics } from "@related/shared";
import { CalendarView } from "./_CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { interactions, calendarEvents } = await getServerDeps();

  // Default window: 30 days back, 30 days forward. The Client view can
  // re-query with its own range once filters change (out of scope for v1 —
  // the window covers the agent's signal horizon and a month of history).
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [allInteractions, externalEvents] = await Promise.all([
    interactions.listInRange({
      from: from.toISOString(),
      to: to.toISOString(),
    }),
    calendarEvents.listInRange({
      from: from.toISOString(),
      to: to.toISOString(),
    }),
  ]);

  const analytics = calendarAnalytics({
    interactions: allInteractions,
    externalEvents,
  });

  return (
    <CalendarView
      interactions={allInteractions}
      externalEvents={externalEvents}
      analytics={analytics}
    />
  );
}
