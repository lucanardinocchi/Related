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
        previousCandidateSet: { id: "cs-prev", mode: "baseline" },
      }),
    );
  });
});
