import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarEventsClient } from "./CalendarEventsClient";

function makeQuery() {
  const order = jest.fn();
  const lte = jest.fn(() => ({ order }));
  const gte = jest.fn(() => ({ lte }));
  const select = jest.fn(() => ({ gte }));
  const from = jest.fn(() => ({ select }));
  return { from, select, gte, lte, order };
}

describe("CalendarEventsClient.listInRange", () => {
  it("queries inferred_signal_calendar within the date range, time-ascending", async () => {
    const q = makeQuery();
    q.order.mockResolvedValue({
      data: [
        {
          id: "ce-1",
          event_id: "g-evt-1",
          title: "team standup",
          start: "2026-05-20T09:00:00Z",
          end: "2026-05-20T09:30:00Z",
          is_all_day: false,
          fetched_at: "2026-05-20T08:00:00Z",
        },
      ],
      error: null,
    });
    const supa = { from: q.from } as unknown as SupabaseClient;
    const client = new CalendarEventsClient(supa);

    const result = await client.listInRange({
      from: "2026-05-20T00:00:00Z",
      to: "2026-05-21T00:00:00Z",
    });

    expect(q.from).toHaveBeenCalledWith("inferred_signal_calendar");
    expect(q.gte).toHaveBeenCalledWith("start", "2026-05-20T00:00:00Z");
    expect(q.lte).toHaveBeenCalledWith("start", "2026-05-21T00:00:00Z");
    expect(q.order).toHaveBeenCalledWith("start", { ascending: true });
    expect(result).toEqual([
      {
        id: "ce-1",
        externalEventId: "g-evt-1",
        source: "google",
        title: "team standup",
        start: "2026-05-20T09:00:00Z",
        end: "2026-05-20T09:30:00Z",
        isAllDay: false,
        fetchedAt: "2026-05-20T08:00:00Z",
      },
    ]);
  });

  it("throws when the query errors", async () => {
    const q = makeQuery();
    q.order.mockResolvedValue({ data: null, error: { message: "no rows" } });
    const supa = { from: q.from } as unknown as SupabaseClient;
    const client = new CalendarEventsClient(supa);

    await expect(
      client.listInRange({ from: "2026-05-20", to: "2026-05-21" }),
    ).rejects.toMatchObject({ message: "no rows" });
  });
});
