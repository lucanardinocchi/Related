import type { SupabaseClient } from "@supabase/supabase-js";
import { AgentService } from "./AgentService";
import type { CandidateActionInput } from "./PassEngine";
import { UserContextBuilder } from "./UserContextBuilder";

/**
 * Smoke-level tests — AgentService composes PassEngine, EdgeFunctionAgentCaller,
 * and Executor. The deep tests live on each of those; here we verify wiring.
 */

interface RunOptions {
  proposed: CandidateActionInput[];
}

function withService({ proposed }: RunOptions) {
  const invoke = jest.fn().mockResolvedValue({
    data: { actions: proposed },
    error: null,
  });

  // PassEngine.runPass needs the postgrest-style chain. Minimal stub so it
  // can read relationships + previous set + open threads, and write the new
  // Candidate Set.
  const single = jest
    .fn()
    .mockResolvedValueOnce({
      data: {
        id: "r-1",
        owner_id: "u-1",
        target_type: "contact",
        contact: { id: "c-1", name: "Sam" },
      },
      error: null,
    })
    .mockResolvedValueOnce({
      data: {
        id: "cs-new",
        owner_id: "u-1",
        relationship_id: "r-1",
        mode: "engaged",
        created_at: "2026-05-19T00:00:00Z",
      },
      error: null,
    });
  const limit = jest
    .fn()
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: [], error: null });
  const order = jest.fn(() => ({ limit }));
  const eq = jest.fn(() => ({ single, order, limit, eq: jest.fn() }));
  const select = jest.fn(() => ({ single, order, eq, limit }));
  const insertSelect = jest.fn(() => ({ single }));
  const insertFlat = jest.fn().mockResolvedValue({ data: null, error: null });
  const insert = jest.fn((row: unknown) => {
    if (Array.isArray(row)) return insertFlat(row);
    return { select: insertSelect };
  });
  const from = jest.fn(() => ({ select, insert }));

  const supa = {
    from,
    functions: { invoke },
  } as unknown as SupabaseClient;

  // No-supabase builder returns the empty snapshot — keeps the mock thin.
  const userContextBuilder = new UserContextBuilder();
  const service = new AgentService({ supabase: supa, userContextBuilder });
  return { service, invoke };
}

describe("AgentService.runEngagedTurn", () => {
  it("invokes engaged-pass via the Edge Function and returns the new Candidate Set", async () => {
    const { service, invoke } = withService({
      proposed: [
        {
          type: "ScheduleInteraction",
          payload: { time: "2026-05-22T17:00:00Z", kind: "coffee", contactIds: ["c-1"] },
          why: "live intent",
        },
        { type: "DoNothing", payload: {} },
      ],
    });

    const result = await service.runEngagedTurn({
      relationshipId: "r-1",
      userTurn: "what about Sam",
      sessionId: "sess-1",
    });

    expect(invoke).toHaveBeenCalledWith(
      "engaged-pass",
      expect.objectContaining({
        body: expect.objectContaining({
          prompt: expect.objectContaining({ mode: "engaged" }),
        }),
      }),
    );
    expect(result.relationshipId).toBe("r-1");
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].type).toBe("ScheduleInteraction");
  });
});
