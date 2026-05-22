import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PassEngine,
  type AgentCaller,
  type PassMode,
  type RelationshipContextSnapshot,
} from "./PassEngine";
import type { NotificationDispatcher } from "../notifications/NotificationDispatcher";
import type { UserContextSnapshot } from "./userContextCore";
import type { RelationshipContextBuilder } from "./RelationshipContextBuilder";
import {
  testContact,
  testRelationshipContextSnapshot,
} from "./relationshipContextFixtures";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

const emptyUserContext = (userId = "u-1"): UserContextSnapshot => ({
  userId,
  asOf: "2026-05-19T00:00:00.000Z",
  goalsAndValues: [],
  situationalState: null,
  operatorStrengths: [],
  inferredSignals: { calendarDensity: null, sleep: null, calendarEvents: [], sleepRecords: [] },
  transientIntent: [], groups: [], otherRelationships: [], characterValuesAlignment: [],
});

function makeQueryMock() {
  const single = jest.fn<Promise<Resolved<unknown>>, []>();
  const limit = jest.fn();
  const order = jest.fn(() => ({ limit }));
  const eqInner = jest.fn(() => ({ single, order, limit }));
  const eq = jest.fn(() => ({ single, order, limit, eq: eqInner }));
  const insertSelect = jest.fn(() => ({ single }));
  const insertFlat = jest.fn<Promise<Resolved<unknown>>, [unknown]>();
  const select = jest.fn(() => ({ single, order, eq, limit }));
  const insert = jest.fn((row: unknown) => {
    if (Array.isArray(row)) {
      return insertFlat(row);
    }
    return { select: insertSelect };
  });
  const from = jest.fn((_t: string) => ({ select, insert }));
  return { from, select, single, eq, eqInner, order, limit, insert, insertSelect, insertFlat };
}

function fixedRelationshipContext(
  over: Partial<RelationshipContextSnapshot> = {},
): RelationshipContextSnapshot {
  return testRelationshipContextSnapshot(over);
}

function withEngine(
  stubActions: { type: string; payload?: unknown; why?: string }[],
  over: {
    relationshipContext?: RelationshipContextSnapshot;
    userContext?: UserContextSnapshot;
  } = {},
) {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  const propose = jest.fn().mockResolvedValue(stubActions);
  const agent: AgentCaller = { propose };
  const relationshipContextBuilder = {
    buildRelationshipContext: jest
      .fn()
      .mockResolvedValue(
        over.relationshipContext ?? fixedRelationshipContext(),
      ),
  } as unknown as RelationshipContextBuilder;
  const buildUserContext = jest
    .fn()
    .mockResolvedValue(over.userContext ?? emptyUserContext());
  const engine = new PassEngine({
    supabase: supa,
    agent,
    relationshipContextBuilder,
    buildUserContext,
  });
  return { q, propose, engine, relationshipContextBuilder, buildUserContext };
}

describe("PassEngine.runPass", () => {
  function primeWrites(q: ReturnType<typeof makeQueryMock>) {
    q.single.mockResolvedValueOnce({
      data: {
        id: "cs-new",
        owner_id: "u-1",
        relationship_id: "r-1",
        mode: "baseline",
        created_at: "2026-05-19T00:00:00Z",
      },
      error: null,
    });
    q.limit.mockResolvedValueOnce({ data: [], error: null });
    q.insertFlat.mockResolvedValueOnce({ data: null, error: null });
  }

  for (const mode of ["baseline", "triggered"] as const) {
    it(`produces a valid Candidate Set for mode='${mode}' with the stubbed DoNothing action`, async () => {
      const { q, engine, propose } = withEngine([
        { type: "DoNothing", why: "no changes warrant a Candidate Action this Pass" },
      ]);
      primeWrites(q);

      const result = await engine.runPass({ relationshipId: "r-1", mode });

      expect(result).toMatchObject({
        id: "cs-new",
        relationshipId: "r-1",
        mode,
        actions: [
          {
            type: "DoNothing",
            why: "no changes warrant a Candidate Action this Pass",
          },
        ],
      });
      expect(propose).toHaveBeenCalledWith(
        expect.objectContaining({
          mode,
          relationshipContext: fixedRelationshipContext(),
          previousCandidateSet: null,
          userContext: expect.objectContaining({ userId: "u-1" }),
        }),
      );
      expect(q.from).toHaveBeenCalledWith("candidate_sets");
      expect(q.from).toHaveBeenCalledWith("candidate_actions");
      expect(q.insertFlat).toHaveBeenCalledWith([
        expect.objectContaining({
          type: "DoNothing",
          decision_state: "ignored",
        }),
      ]);
    });
  }

  it("loads the previous Candidate Set so the agent can apply continuity bias", async () => {
    const { q, engine, propose } = withEngine([{ type: "DoNothing" }]);
    q.limit.mockResolvedValueOnce({
      data: [{ id: "cs-prev", mode: "baseline" }],
      error: null,
    });
    primeWrites(q);

    await engine.runPass({ relationshipId: "r-1", mode: "baseline" });
    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        previousCandidateSet: expect.objectContaining({
          id: "cs-prev",
          mode: "baseline",
        }),
      }),
    );
  });

  it("calls dispatcher.maybeDispatch for baseline mode when a non-DoNothing candidate is produced", async () => {
    const dispatcher = {
      maybeDispatch: jest.fn().mockResolvedValue({ kind: "skipped_disabled" }),
    } as unknown as NotificationDispatcher;
    const q = makeQueryMock();
    const supa = { from: q.from } as unknown as SupabaseClient;
    const propose = jest.fn().mockResolvedValue([
      {
        type: "ScheduleInteraction",
        payload: { time: "2026-05-22T17:00:00Z", kind: "coffee" },
        why: "open thread aging",
      },
      { type: "DoNothing", payload: {} },
    ]);
    const engine = new PassEngine({
      supabase: supa,
      agent: { propose },
      dispatcher,
      relationshipContextBuilder: {
        buildRelationshipContext: jest
          .fn()
          .mockResolvedValue(fixedRelationshipContext()),
      } as unknown as RelationshipContextBuilder,
      buildUserContext: jest.fn().mockResolvedValue(emptyUserContext()),
    });
    primeWrites(q);

    await engine.runPass({ relationshipId: "r-1", mode: "baseline" });

    expect(dispatcher.maybeDispatch).toHaveBeenCalledTimes(1);
    expect(dispatcher.maybeDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "u-1",
        relationshipId: "r-1",
        salience: expect.any(Number),
        title: expect.stringContaining("Sam"),
      }),
    );
  });

  it("does NOT call dispatcher when the only candidate is DoNothing (nothing to notify about)", async () => {
    const dispatcher = {
      maybeDispatch: jest.fn().mockResolvedValue({ kind: "sent", count: 1 }),
    } as unknown as NotificationDispatcher;
    const q = makeQueryMock();
    const supa = { from: q.from } as unknown as SupabaseClient;
    const propose = jest.fn().mockResolvedValue([{ type: "DoNothing", payload: {} }]);
    const engine = new PassEngine({
      supabase: supa,
      agent: { propose },
      dispatcher,
      relationshipContextBuilder: {
        buildRelationshipContext: jest
          .fn()
          .mockResolvedValue(fixedRelationshipContext()),
      } as unknown as RelationshipContextBuilder,
      buildUserContext: jest.fn().mockResolvedValue(emptyUserContext()),
    });
    primeWrites(q);

    await engine.runPass({ relationshipId: "r-1", mode: "baseline" });

    expect(dispatcher.maybeDispatch).not.toHaveBeenCalled();
  });

  it("loads the previous Candidate Set's actions + decisions so the agent sees what the User picked, declined, edited, or ignored", async () => {
    const q = makeQueryMock();
    const decisions = [
      {
        id: "ca-1",
        type: "ScheduleInteraction",
        payload: { time: "2026-05-20T17:00:00Z", kind: "coffee" },
        why: null,
        decision_state: "declined",
      },
      {
        id: "ca-2",
        type: "OpenThread",
        payload: { description: "book", direction: "me_owes_them" },
        why: null,
        decision_state: "picked",
      },
    ];
    let eqCallCount = 0;
    q.eq.mockImplementation(() => {
      eqCallCount += 1;
      if (eqCallCount === 2) {
        return Promise.resolve({ data: decisions, error: null }) as unknown as ReturnType<
          typeof q.eq
        >;
      }
      return {
        single: q.single,
        order: q.order,
        limit: q.limit,
        eq: q.eqInner,
      } as unknown as ReturnType<typeof q.eq>;
    });

    const supa = { from: q.from } as unknown as SupabaseClient;
    const propose = jest.fn().mockResolvedValue([{ type: "DoNothing" }]);
    const engine = new PassEngine({
      supabase: supa,
      agent: { propose },
      relationshipContextBuilder: {
        buildRelationshipContext: jest
          .fn()
          .mockResolvedValue(fixedRelationshipContext()),
      } as unknown as RelationshipContextBuilder,
      buildUserContext: jest.fn().mockResolvedValue(emptyUserContext()),
    });

    q.single.mockResolvedValueOnce({
      data: {
        id: "cs-new",
        owner_id: "u-1",
        relationship_id: "r-1",
        mode: "baseline",
        created_at: "2026-05-19T00:00:00Z",
      },
      error: null,
    });
    q.limit.mockResolvedValueOnce({
      data: [{ id: "cs-prev", mode: "baseline" }],
      error: null,
    });
    q.insertFlat.mockResolvedValueOnce({ data: null, error: null });

    await engine.runPass({ relationshipId: "r-1", mode: "baseline" });

    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        previousCandidateSet: {
          id: "cs-prev",
          mode: "baseline",
          actions: [
            {
              id: "ca-1",
              type: "ScheduleInteraction",
              payload: { time: "2026-05-20T17:00:00Z", kind: "coffee" },
              why: null,
              decisionState: "declined",
            },
            {
              id: "ca-2",
              type: "OpenThread",
              payload: { description: "book", direction: "me_owes_them" },
              why: null,
              decisionState: "picked",
            },
          ],
        },
      }),
    );
  });

  it("passes full relationship context including interactions and open threads to the agent", async () => {
    const openThreads = [
      {
        open_threads: {
          id: "ot-1",
          description: "promised book",
          direction: "me_owes_them",
          created_at: "2026-05-10T00:00:00Z",
        },
      },
    ];
    const interactions = [
      {
        id: "i-1",
        time: "2026-05-18T20:00:00Z",
        kind: "dinner",
        status: "occurred",
      },
    ];
    const { q, engine, propose } = withEngine([{ type: "DoNothing" }], {
      relationshipContext: fixedRelationshipContext({
        openThreads: openThreads as RelationshipContextSnapshot["openThreads"],
        interactions: interactions as RelationshipContextSnapshot["interactions"],
      }),
    });
    primeWrites(q);

    await engine.runPass({ relationshipId: "r-1", mode: "baseline" });

    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        relationshipContext: expect.objectContaining({
          interactions,
          openThreads,
          contact: testContact(),
        }),
      }),
    );
  });

  it("loads ambient user context via assembleUserContextForAmbientPass seam", async () => {
    const { q, engine, buildUserContext } = withEngine([{ type: "DoNothing" }]);
    primeWrites(q);

    await engine.runPass({ relationshipId: "r-1", mode: "baseline" });

    expect(buildUserContext).toHaveBeenCalledWith("u-1", expect.any(Date), "r-1");
  });
});
