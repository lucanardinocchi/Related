import type { SupabaseClient } from "@supabase/supabase-js";
import { UserContextBuilder } from "./UserContextBuilder";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock(
  tableData: Record<string, unknown> = {},
  tableLimitData: Record<string, unknown> = {},
) {
  const emptyList = { data: [] as unknown[], error: null };

  function attachLimit<T>(promise: Promise<T>, limitFn: jest.Mock) {
    return Object.assign(promise, { limit: limitFn });
  }

  const maybeSingle = jest.fn<Promise<Resolved<unknown>>, []>();
  const lt = jest.fn<Promise<Resolved<unknown>>, []>();
  const lte = jest.fn<Promise<Resolved<unknown>>, []>();
  const gt = jest.fn<Promise<Resolved<unknown>>, []>();
  const eq = jest.fn(() => ({ gt }));
  const gte = jest.fn(() => ({ lt, lte }));

  const relationshipNeq = jest.fn();

  const from = jest.fn((table: string) => {
    const limit = jest.fn<Promise<Resolved<unknown>>, []>().mockResolvedValue(
      tableLimitData[table] !== undefined
        ? { data: tableLimitData[table], error: null }
        : emptyList,
    );
    const order = jest.fn(() =>
      attachLimit(
        Promise.resolve(
          tableData[table] !== undefined
            ? { data: tableData[table], error: null }
            : emptyList,
        ),
        limit,
      ),
    );
    const neq = jest.fn((...args: unknown[]) => {
      if (table === "relationships") relationshipNeq(...args);
      return { order, limit };
    });
    const select = jest.fn(() => ({ order, maybeSingle, gte, eq, limit, neq }));
    return { select };
  });

  return { from, maybeSingle, gte, lt, lte, gt, eq, relationshipNeq };
}

const emptySnapshotFields = {
  groups: [],
  otherRelationships: [],
  characterValuesAlignment: [],
  inferredSignals: {
    calendarDensity: null,
    sleep: null,
    calendarEvents: [],
    sleepRecords: [],
  },
};

describe("UserContextBuilder.buildUserContext — Slice 10", () => {
  it("returns the empty snapshot when no supabase client is wired", async () => {
    const builder = new UserContextBuilder();
    const snapshot = await builder.buildUserContext("u-1", new Date("2026-05-19T00:00:00Z"));

    expect(snapshot).toEqual({
      userId: "u-1",
      asOf: "2026-05-19T00:00:00.000Z",
      transientIntent: [],
      situationalState: null,
      goalsAndValues: [],
      operatorStrengths: [],
      ...emptySnapshotFields,
    });
  });

  it("populates Goals & Values and Situational State when a supabase client is wired", async () => {
    const q = makeQueryMock({
      goals_and_values: [
        {
          id: "g-1",
          content: "Be more present with family",
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
        },
        {
          id: "g-2",
          content: "Move slow, build deep relationships",
          created_at: "2026-05-02T00:00:00Z",
          updated_at: "2026-05-02T00:00:00Z",
        },
      ],
    });
    q.maybeSingle.mockResolvedValue({
      data: {
        id: "ss-1",
        content: "Just moved to Sydney",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-19T00:00:00Z",
      },
      error: null,
    });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date("2026-05-19T01:00:00Z"));

    expect(snapshot.goalsAndValues).toEqual([
      {
        id: "g-1",
        content: "Be more present with family",
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z",
      },
      {
        id: "g-2",
        content: "Move slow, build deep relationships",
        createdAt: "2026-05-02T00:00:00Z",
        updatedAt: "2026-05-02T00:00:00Z",
      },
    ]);
    expect(snapshot.situationalState).toEqual({
      id: "ss-1",
      content: "Just moved to Sydney",
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-19T00:00:00Z",
    });
    expect(q.from).toHaveBeenCalledWith("goals_and_values");
    expect(q.from).toHaveBeenCalledWith("situational_state");
  });

  it("populates calendar density and raw events from inferred_signal_calendar when events exist", async () => {
    const q = makeQueryMock();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({
      data: [
        {
          event_id: "evt-1",
          title: "Coffee",
          start: "2026-05-19T10:00:00Z",
          end: "2026-05-19T11:00:00Z",
          is_all_day: false,
        },
      ],
      error: null,
    });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext(
      "u-1",
      new Date("2026-05-19T08:00:00Z"),
    );

    expect(snapshot.inferredSignals.calendarDensity).toEqual(
      expect.objectContaining({ density: 1, bucket: "light" }),
    );
    expect(snapshot.inferredSignals.calendarEvents).toEqual([
      {
        id: "evt-1",
        title: "Coffee",
        start: "2026-05-19T10:00:00Z",
        end: "2026-05-19T11:00:00Z",
        isAllDay: false,
      },
    ]);
    expect(q.from).toHaveBeenCalledWith("inferred_signal_calendar");
  });

  it("calendar density is null when no events are present (graceful degradation)", async () => {
    const q = makeQueryMock();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());
    expect(snapshot.inferredSignals.calendarDensity).toBeNull();
    expect(snapshot.inferredSignals.calendarEvents).toEqual([]);
  });

  it("populates sleep signal and raw records from inferred_signal_sleep when records exist", async () => {
    const q = makeQueryMock();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    q.lte.mockResolvedValue({
      data: [
        {
          record_id: "hk-1",
          started_at: "2026-05-18T22:00:00Z",
          ended_at: "2026-05-19T06:00:00Z",
          duration_minutes: 480,
          quality: null,
        },
      ],
      error: null,
    });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext(
      "u-1",
      new Date("2026-05-19T08:00:00Z"),
    );

    expect(snapshot.inferredSignals.sleep).toEqual(
      expect.objectContaining({ nights: 1, averageHours: 8, bucket: "well_rested" }),
    );
    expect(snapshot.inferredSignals.sleepRecords).toEqual([
      {
        id: "hk-1",
        startedAt: "2026-05-18T22:00:00Z",
        endedAt: "2026-05-19T06:00:00Z",
        durationMinutes: 480,
        quality: null,
      },
    ]);
    expect(q.from).toHaveBeenCalledWith("inferred_signal_sleep");
  });

  it("sleep is null when no records exist (graceful degradation)", async () => {
    const q = makeQueryMock();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());
    expect(snapshot.inferredSignals.sleep).toBeNull();
    expect(snapshot.inferredSignals.sleepRecords).toEqual([]);
  });

  it("includes Transient Intent only when mode='engaged' AND a sessionId is provided", async () => {
    const q = makeQueryMock();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.gt.mockResolvedValue({
      data: [{ content: "plan my birthday" }],
      error: null,
    });
    const supa = { from: q.from } as unknown as SupabaseClient;
    const builder = new UserContextBuilder({ supabase: supa });

    const engaged = await builder.buildUserContext("u-1", new Date(), {
      mode: "engaged",
      sessionId: "sess-1",
    });
    expect(engaged.transientIntent).toEqual(["plan my birthday"]);
    expect(q.from).toHaveBeenCalledWith("transient_intent");
    expect(q.eq).toHaveBeenCalledWith("session_id", "sess-1");

    const baseline = await builder.buildUserContext("u-1", new Date(), {
      mode: "baseline",
    });
    expect(baseline.transientIntent).toEqual([]);
  });

  it("tolerates a User with no Goals or Situational State (empty arrays)", async () => {
    const q = makeQueryMock();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());

    expect(snapshot.goalsAndValues).toEqual([]);
    expect(snapshot.situationalState).toBeNull();
    expect(snapshot.operatorStrengths).toEqual([]);
  });

  it("populates Operator Strengths from operator_strengths when rows exist", async () => {
    const q = makeQueryMock({
      operator_strengths: [
        {
          id: "os-1",
          content: "AI/ML expertise",
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
        },
        {
          id: "os-2",
          content: "intros in startups",
          created_at: "2026-05-02T00:00:00Z",
          updated_at: "2026-05-02T00:00:00Z",
        },
      ],
    });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());

    expect(snapshot.operatorStrengths).toEqual([
      {
        id: "os-1",
        content: "AI/ML expertise",
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-01T00:00:00Z",
      },
      {
        id: "os-2",
        content: "intros in startups",
        createdAt: "2026-05-02T00:00:00Z",
        updatedAt: "2026-05-02T00:00:00Z",
      },
    ]);
    expect(q.from).toHaveBeenCalledWith("operator_strengths");
  });

  it("populates groups list and other relationships summary", async () => {
    const q = makeQueryMock(
      {},
      {
        groups: [
          {
            id: "grp-1",
            name: "College friends",
            created_at: "2026-05-01T00:00:00Z",
            contact_groups: [{ contact_id: "c-1" }, { contact_id: "c-2" }],
          },
        ],
        relationships: [
          {
            id: "r-2",
            target_type: "contact",
            role: "mentor",
            cadence: "monthly",
            contact: { name: "Alex" },
            group_target: null,
          },
        ],
      },
    );
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date(), {
      excludeRelationshipId: "r-1",
    });

    expect(snapshot.groups).toEqual([
      {
        id: "grp-1",
        name: "College friends",
        memberCount: 2,
        createdAt: "2026-05-01T00:00:00Z",
      },
    ]);
    expect(snapshot.otherRelationships).toEqual([
      {
        id: "r-2",
        targetType: "contact",
        name: "Alex",
        role: "mentor",
        cadence: "monthly",
      },
    ]);
    expect(q.from).toHaveBeenCalledWith("groups");
    expect(q.from).toHaveBeenCalledWith("relationships");
    expect(q.relationshipNeq).toHaveBeenCalledWith("id", "r-1");
  });

  it("populates character values alignment from user_character_values_alignment", async () => {
    const q = makeQueryMock({
      user_character_values_alignment: [
        {
          id: "va-1",
          character_id: "char-1",
          aligned: true,
          rank_position: 1,
          character_name: "Leslie Knope",
          character_source: "Parks and Rec",
          character_values: ["public service", "loyalty"],
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-10T00:00:00Z",
        },
      ],
    });
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    q.lte.mockResolvedValue({ data: [], error: null });
    q.lt.mockResolvedValue({ data: [], error: null });
    const supa = { from: q.from } as unknown as SupabaseClient;

    const builder = new UserContextBuilder({ supabase: supa });
    const snapshot = await builder.buildUserContext("u-1", new Date());

    expect(snapshot.characterValuesAlignment).toEqual([
      {
        id: "va-1",
        characterId: "char-1",
        aligned: true,
        rankPosition: 1,
        characterName: "Leslie Knope",
        characterSource: "Parks and Rec",
        characterValues: ["public service", "loyalty"],
        createdAt: "2026-05-01T00:00:00Z",
        updatedAt: "2026-05-10T00:00:00Z",
      },
    ]);
    expect(q.from).toHaveBeenCalledWith("user_character_values_alignment");
  });
});
