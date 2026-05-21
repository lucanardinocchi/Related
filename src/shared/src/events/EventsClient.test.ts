import type { SupabaseClient } from "@supabase/supabase-js";
import { EventsClient } from "./EventsClient";

type Resolved<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } };

function makeListQuery() {
  const order = jest.fn<Promise<Resolved<unknown>>, []>();
  const lte = jest.fn(() => ({ order }));
  const gte = jest.fn(() => ({ lte }));
  const select = jest.fn(() => ({ gte }));
  const from = jest.fn(() => ({ select }));
  return { from, select, gte, lte, order };
}

describe("EventsClient.listInRange", () => {
  it("queries events within [from, to] start-ascending and maps attendees", async () => {
    const q = makeListQuery();
    q.order.mockResolvedValue({
      data: [
        {
          id: "ev-1",
          title: "Standup",
          start: "2026-05-20T09:00:00Z",
          end: "2026-05-20T09:30:00Z",
          is_all_day: false,
          location: "Zoom",
          aim: "sync",
          required_prep: null,
          status: "planned",
          type: "meeting",
          source: "google",
          external_event_id: "g-evt-1",
          event_attendees: [
            { contact_id: "c-1", contacts: { name: "Sam" } },
          ],
        },
      ],
      error: null,
    });
    const supa = { from: q.from } as unknown as SupabaseClient;
    const client = new EventsClient(supa);

    const result = await client.listInRange({
      from: "2026-05-20T00:00:00Z",
      to: "2026-05-21T00:00:00Z",
    });

    expect(q.from).toHaveBeenCalledWith("events");
    expect(q.gte).toHaveBeenCalledWith("start", "2026-05-20T00:00:00Z");
    expect(q.lte).toHaveBeenCalledWith("start", "2026-05-21T00:00:00Z");
    expect(q.order).toHaveBeenCalledWith("start", { ascending: true });
    expect(result).toEqual([
      {
        id: "ev-1",
        title: "Standup",
        start: "2026-05-20T09:00:00Z",
        end: "2026-05-20T09:30:00Z",
        isAllDay: false,
        location: "Zoom",
        aim: "sync",
        requiredPrep: null,
        status: "planned",
        type: "meeting",
        source: "google",
        externalEventId: "g-evt-1",
        attendees: [{ id: "c-1", name: "Sam" }],
      },
    ]);
  });

  it("throws when the query errors", async () => {
    const q = makeListQuery();
    q.order.mockResolvedValue({ data: null, error: { message: "boom" } });
    const supa = { from: q.from } as unknown as SupabaseClient;
    const client = new EventsClient(supa);

    await expect(
      client.listInRange({ from: "2026-05-20", to: "2026-05-21" }),
    ).rejects.toMatchObject({ message: "boom" });
  });
});

describe("EventsClient.getEvent", () => {
  it("fetches a single event by id", async () => {
    const single = jest.fn<Promise<Resolved<unknown>>, []>();
    single.mockResolvedValue({
      data: {
        id: "ev-1",
        title: "Coffee with Jo",
        start: "2026-05-22T15:00:00Z",
        end: "2026-05-22T16:00:00Z",
        is_all_day: false,
        location: null,
        aim: null,
        required_prep: null,
        status: "planned",
        type: "personal",
        source: "manual",
        external_event_id: null,
        event_attendees: [],
      },
      error: null,
    });
    const eq = jest.fn(() => ({ single }));
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    const supa = { from } as unknown as SupabaseClient;
    const client = new EventsClient(supa);

    const event = await client.getEvent("ev-1");

    expect(from).toHaveBeenCalledWith("events");
    expect(eq).toHaveBeenCalledWith("id", "ev-1");
    expect(event.id).toBe("ev-1");
    expect(event.attendees).toEqual([]);
  });
});

describe("EventsClient.createEvent", () => {
  it("inserts owner_id from auth and returns the new id", async () => {
    const single = jest.fn<Promise<Resolved<{ id: string }>>, []>();
    single.mockResolvedValue({ data: { id: "ev-new" }, error: null });
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn<{ select: typeof select }, [Record<string, unknown>]>(
      () => ({ select }),
    );
    const from = jest.fn(() => ({ insert }));
    const auth = {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "owner-1" } },
      }),
    };
    const supa = { from, auth } as unknown as SupabaseClient;
    const client = new EventsClient(supa);

    const id = await client.createEvent({
      title: "Lunch",
      start: "2026-05-22T12:00:00Z",
      end: "2026-05-22T13:00:00Z",
      type: "personal",
    });

    expect(id).toBe("ev-new");
    expect(from).toHaveBeenCalledWith("events");
    const payload = insert.mock.calls[0][0];
    expect(payload.owner_id).toBe("owner-1");
    expect(payload.title).toBe("Lunch");
    expect(payload.type).toBe("personal");
    expect(payload.status).toBe("planned");
    expect(payload.source).toBe("manual");
  });
});

describe("EventsClient.updateEvent", () => {
  it("patches only provided fields and returns the refreshed row", async () => {
    const single = jest.fn<Promise<Resolved<unknown>>, []>();
    single.mockResolvedValue({
      data: {
        id: "ev-1",
        title: "Lunch",
        start: "2026-05-22T12:00:00Z",
        end: "2026-05-22T13:00:00Z",
        is_all_day: false,
        location: "Cafe",
        aim: "catch up",
        required_prep: null,
        status: "planned",
        type: "personal",
        source: "manual",
        external_event_id: null,
        event_attendees: [],
      },
      error: null,
    });
    const select = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select }));
    const update = jest.fn<{ eq: typeof eq }, [Record<string, unknown>]>(
      () => ({ eq }),
    );
    const from = jest.fn(() => ({ update }));
    const supa = { from } as unknown as SupabaseClient;
    const client = new EventsClient(supa);

    const event = await client.updateEvent("ev-1", {
      location: "Cafe",
      aim: "catch up",
    });

    const patch = update.mock.calls[0][0];
    expect(patch.location).toBe("Cafe");
    expect(patch.aim).toBe("catch up");
    expect(patch.title).toBeUndefined();
    expect(eq).toHaveBeenCalledWith("id", "ev-1");
    expect(event.location).toBe("Cafe");
  });
});

describe("EventsClient.setAttendees", () => {
  it("deletes existing links then inserts the new set", async () => {
    const delEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const del = jest.fn(() => ({ eq: delEq }));
    const ins = jest.fn().mockResolvedValue({ data: null, error: null });
    const from = jest.fn(() => ({ delete: del, insert: ins }));
    const supa = { from } as unknown as SupabaseClient;
    const client = new EventsClient(supa);

    await client.setAttendees("ev-1", ["c-1", "c-2"]);

    expect(delEq).toHaveBeenCalledWith("event_id", "ev-1");
    expect(ins).toHaveBeenCalledWith([
      { event_id: "ev-1", contact_id: "c-1" },
      { event_id: "ev-1", contact_id: "c-2" },
    ]);
  });

  it("skips the insert when the new set is empty", async () => {
    const delEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const del = jest.fn(() => ({ eq: delEq }));
    const ins = jest.fn();
    const from = jest.fn(() => ({ delete: del, insert: ins }));
    const supa = { from } as unknown as SupabaseClient;
    const client = new EventsClient(supa);

    await client.setAttendees("ev-1", []);

    expect(delEq).toHaveBeenCalled();
    expect(ins).not.toHaveBeenCalled();
  });
});

describe("EventsClient.deleteEvent", () => {
  it("deletes by id", async () => {
    const eq = jest.fn().mockResolvedValue({ data: null, error: null });
    const del = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ delete: del }));
    const supa = { from } as unknown as SupabaseClient;
    const client = new EventsClient(supa);

    await client.deleteEvent("ev-1");

    expect(from).toHaveBeenCalledWith("events");
    expect(eq).toHaveBeenCalledWith("id", "ev-1");
  });
});
