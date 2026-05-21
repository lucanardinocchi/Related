import {
  EVENTS_GOOGLE_OWNED_COLUMNS,
  EVENTS_USER_OWNED_COLUMNS,
  toEventsGoogleRow,
  toSignalRow,
} from "./calendarSyncDualWrite";

describe("calendarSyncDualWrite", () => {
  const event = {
    id: "google-abc",
    title: "Standup",
    start: "2026-05-21T09:00:00.000Z",
    end: "2026-05-21T09:30:00.000Z",
    isAllDay: false,
    location: "Zoom",
  };

  it("documents Google-owned vs user-owned events columns", () => {
    expect(EVENTS_GOOGLE_OWNED_COLUMNS).toContain("title");
    expect(EVENTS_USER_OWNED_COLUMNS).toContain("aim");
    expect(EVENTS_USER_OWNED_COLUMNS).not.toContain("title");
  });

  it("maps a fetcher event to inferred_signal_calendar row shape", () => {
    expect(toSignalRow("owner-1", event)).toEqual({
      owner_id: "owner-1",
      event_id: "google-abc",
      title: "Standup",
      start: event.start,
      end: event.end,
      is_all_day: false,
    });
  });

  it("maps a fetcher event to events table Google upsert shape", () => {
    expect(toEventsGoogleRow("owner-1", event)).toEqual({
      owner_id: "owner-1",
      external_event_id: "google-abc",
      source: "google",
      title: "Standup",
      start: event.start,
      end: event.end,
      is_all_day: false,
      location: "Zoom",
    });
  });
});
