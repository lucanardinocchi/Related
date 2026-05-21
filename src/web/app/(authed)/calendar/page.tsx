import { getServerDeps } from "@/lib/deps/server";
import { calendarAnalytics } from "@related/shared";
import { CalendarView } from "./_CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { events } = await getServerDeps();

  // 30 days back, 30 days forward — same window the Slice 11 view used.
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const allEvents = await events.listInRange({
    from: from.toISOString(),
    to: to.toISOString(),
  });

  const analytics = calendarAnalytics({ events: allEvents });

  return <CalendarView events={allEvents} analytics={analytics} />;
}
