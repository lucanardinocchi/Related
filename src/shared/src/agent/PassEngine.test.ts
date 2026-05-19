import type { SupabaseClient } from "@supabase/supabase-js";
import { PassEngine, type AgentCaller, type PassMode } from "./PassEngine";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

/**
 * Mock of the postgrest chain PassEngine drives. Reads + writes are scoped to
 * a single Relationship per call, so the mock is one builder shared by both.
 */
function makeQueryMock() {
  // For reads:    from('relationships').select('*,...').eq('id', id).single()
  //               from('open_threads').select(...).eq(...).order(...) etc.
  //               from('candidate_sets').select(...).eq(...).order(...).limit(...)
  // For writes:   from('candidate_sets').insert({...}).select().single()
  //               from('candidate_actions').insert([{...}])
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

function withEngine(stubActions: { type: string; payload?: unknown; why?: string }[]) {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  const propose = jest.fn().mockResolvedValue(stubActions);
  const agent: AgentCaller = { propose };
  const engine = new PassEngine({ supabase: supa, agent });
  return { q, propose, engine };
}

describe("PassEngine.runPass", () => {
  const fixedRelationship = {
    id: "r-1",
    owner_id: "u-1",
    target_type: "contact",
    contact: { id: "c-1", name: "Sam" },
  };

  function primeReads(
    q: ReturnType<typeof makeQueryMock>,
    over: { previousSet?: { id: string; mode: PassMode } | null; openThreads?: unknown[] } = {},
  ) {
    const previousSet = over.previousSet === undefined ? null : over.previousSet;
    const openThreads = over.openThreads ?? [];
    // .single() resolves twice: once for the relationship read, once for the
    // post-insert select that returns the persisted CandidateSet.
    q.single
      .mockResolvedValueOnce({ data: fixedRelationship as unknown as object, error: null })
      .mockResolvedValueOnce({
        data: {
          id: "cs-new",
          owner_id: "u-1",
          relationship_id: "r-1",
          mode: "baseline",
          created_at: "2026-05-19T00:00:00Z",
        },
        error: null,
      });
    // .limit() is the terminal awaited call for both the previous-set list
    // read AND the open-threads list read. Order: previous-set first.
    q.limit
      .mockResolvedValueOnce({
        data: previousSet ? [previousSet] : [],
        error: null,
      })
      .mockResolvedValueOnce({ data: openThreads, error: null });
    q.insertFlat.mockResolvedValueOnce({ data: null, error: null });
  }

  for (const mode of ["baseline", "triggered", "engaged"] as const) {
    it(`produces a valid Candidate Set for mode='${mode}' with the stubbed DoNothing action`, async () => {
      const { q, engine, propose } = withEngine([
        { type: "DoNothing", why: "no changes warrant a Candidate Action this Pass" },
      ]);
      primeReads(q);

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
      // Engine called the agent with a prompt whose shape includes the
      // Relationship, Open Threads (empty here), the previous Candidate Set
      // (none here), the User Context snapshot, and the mode.
      expect(propose).toHaveBeenCalledWith(
        expect.objectContaining({
          mode,
          relationship: fixedRelationship,
          openThreads: [],
          previousCandidateSet: null,
          userContext: expect.objectContaining({ userId: "u-1" }),
        }),
      );
      // Persistence:
      expect(q.from).toHaveBeenCalledWith("candidate_sets");
      expect(q.from).toHaveBeenCalledWith("candidate_actions");
    });
  }

  it("loads the previous Candidate Set so the agent can apply continuity bias", async () => {
    const { q, engine, propose } = withEngine([{ type: "DoNothing" }]);
    primeReads(q, {
      previousSet: { id: "cs-prev", mode: "baseline" },
    });

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

  it("loads the previous Candidate Set's actions + decisions so the agent sees what the User picked, declined, edited, or ignored", async () => {
    // The candidate_actions fetch is keyed by .eq('candidate_set_id', ...).
    // We extend the mock so that select-only chains (no order/limit) can
    // resolve via a terminal .eq() that returns an awaitable.
    const q = makeQueryMock();
    // Decisions for previous set 'cs-prev':
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
    // Override q.eq so the second .from('candidate_actions') chain resolves.
    // PassEngine call sites:
    //   from('relationships').select(...).eq('id', id).single()
    //   from('candidate_sets').select(...).eq('relationship_id', id).order(...).limit(1) → list
    //   from('open_thread_relationships').select(...).eq(...).order(...).limit(50)
    //   from('candidate_actions').select(...).eq('candidate_set_id', cs-prev)   ← NEW
    //   from('candidate_sets').insert(...).select().single()
    //   from('candidate_actions').insert([...])
    //
    // q.eq is already a jest.fn that returns the shared { single, order, limit, eq: eqInner } chain.
    // We need it to also be awaitable for the candidate_actions list read. Patch via mockImplementation.
    let eqCallCount = 0;
    q.eq.mockImplementation(() => {
      eqCallCount += 1;
      // PassEngine call order:
      //   1st: relationships .eq('id', ...).single()
      //   2nd: candidate_sets .eq('relationship_id', ...).order(...).limit(...)
      //   3rd: candidate_actions .eq('candidate_set_id', ...) — awaitable
      //   4th: open_thread_relationships .eq('relationship_id', ...).order(...).limit(...)
      if (eqCallCount === 3) {
        return Promise.resolve({ data: decisions, error: null }) as unknown as ReturnType<typeof q.eq>;
      }
      return { single: q.single, order: q.order, limit: q.limit, eq: q.eqInner } as unknown as ReturnType<typeof q.eq>;
    });

    const supa = { from: q.from } as unknown as SupabaseClient;
    const propose = jest.fn().mockResolvedValue([{ type: "DoNothing" }]);
    const engine = new PassEngine({ supabase: supa, agent: { propose } });

    q.single
      .mockResolvedValueOnce({ data: fixedRelationship, error: null })
      .mockResolvedValueOnce({
        data: {
          id: "cs-new",
          owner_id: "u-1",
          relationship_id: "r-1",
          mode: "baseline",
          created_at: "2026-05-19T00:00:00Z",
        },
        error: null,
      });
    q.limit
      .mockResolvedValueOnce({
        data: [{ id: "cs-prev", mode: "baseline" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
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
});
