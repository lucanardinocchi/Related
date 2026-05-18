import type { SupabaseClient } from "@supabase/supabase-js";
import { Executor } from "./Executor";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  // Chains used by Executor:
  //   from('candidate_actions').update({...}).eq('id', id).select().single()
  //   from('candidate_sets').select(cols).eq('id', id).single()
  const single = jest.fn<Promise<Resolved<unknown>>, []>();
  const select = jest.fn(() => ({ single }));
  const eq = jest.fn(() => ({ single, select }));
  const update = jest.fn(() => ({ eq }));
  const topSelect = jest.fn(() => ({ eq }));
  const from = jest.fn((_t: string) => ({ update, select: topSelect }));
  return { from, update, eq, single, select, topSelect };
}

function withExecutor() {
  const q = makeQueryMock();
  const supa = { from: q.from } as unknown as SupabaseClient;
  const scheduleTriggeredPass = jest.fn().mockResolvedValue(undefined);
  const executor = new Executor({ supabase: supa, scheduleTriggeredPass });
  return { q, executor, scheduleTriggeredPass };
}

describe("Executor.execute — DoNothing", () => {
  it("records the candidate as declined and schedules a Triggered Pass on the Relationship", async () => {
    const { q, executor, scheduleTriggeredPass } = withExecutor();
    // .from('candidate_actions').update({...}).eq('id', id).select().single()
    q.single.mockResolvedValueOnce({
      data: {
        id: "ca-1",
        owner_id: "u-1",
        candidate_set_id: "cs-1",
        type: "DoNothing",
        decision_state: "declined",
      },
      error: null,
    });
    // The Executor also looks up the relationship id off the candidate set
    // so it knows which Relationship to schedule a Pass against. Second
    // .single() resolves to the parent set row.
    q.single.mockResolvedValueOnce({
      data: { id: "cs-1", relationship_id: "r-1" },
      error: null,
    });

    const result = await executor.execute({
      action: {
        id: "ca-1",
        type: "DoNothing",
        candidateSetId: "cs-1",
        ownerId: "u-1",
      },
    });

    expect(result.kind).toBe("declined");
    expect(q.from).toHaveBeenCalledWith("candidate_actions");
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ decision_state: "declined" }),
    );
    expect(scheduleTriggeredPass).toHaveBeenCalledWith({
      relationshipId: "r-1",
      reason: "candidate_decision",
    });
  });

  it("propagates user edits to the action payload before recording the decision", async () => {
    // Per the brief, the user can edit any field of a Candidate Action before
    // accepting it. For DoNothing edits don't change much, but the contract
    // is the Executor reads userEdits and merges them onto the action.
    const { q, executor } = withExecutor();
    q.single.mockResolvedValueOnce({
      data: {
        id: "ca-2",
        type: "DoNothing",
        decision_state: "declined",
        payload: { note: "user added a thought" },
      },
      error: null,
    });
    q.single.mockResolvedValueOnce({
      data: { id: "cs-2", relationship_id: "r-2" },
      error: null,
    });

    await executor.execute({
      action: { id: "ca-2", type: "DoNothing", candidateSetId: "cs-2", ownerId: "u-1" },
      userEdits: { payload: { note: "user added a thought" } },
    });

    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({
        decision_state: "declined",
        payload: { note: "user added a thought" },
      }),
    );
  });
});
