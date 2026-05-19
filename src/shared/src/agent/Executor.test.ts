import type { SupabaseClient } from "@supabase/supabase-js";
import { Executor } from "./Executor";

type Resolved<T> = { data: T; error: null } | { data: null; error: { message: string } };

function makeQueryMock() {
  // Chains used by Executor:
  //   from('candidate_actions').update({...}).eq('id', id).select().single()
  //   from('candidate_sets').select(cols).eq('id', id).single()
  //   from('relationships').update({...}).eq('id', id).select().single()
  //   from('open_threads').update({...}).eq('id', id).select().single()
  const single = jest.fn<Promise<Resolved<unknown>>, []>();
  const select = jest.fn(() => ({ single }));
  const eq = jest.fn(() => ({ single, select }));
  const update = jest.fn(() => ({ eq }));
  const topSelect = jest.fn(() => ({ eq }));
  const from = jest.fn((_t: string) => ({ update, select: topSelect }));
  const rpc = jest.fn<Promise<Resolved<unknown>>, [string, unknown]>();
  return { from, update, eq, single, select, topSelect, rpc };
}

function withExecutor() {
  const q = makeQueryMock();
  const supa = { from: q.from, rpc: q.rpc } as unknown as SupabaseClient;
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

describe("Executor.execute — ScheduleInteraction", () => {
  it("creates a planned Interaction via create_interaction RPC, records the decision as picked, and schedules a Triggered Pass", async () => {
    const { q, executor, scheduleTriggeredPass } = withExecutor();
    // 1) update().eq().select().single() → updated candidate_action row
    // 2) candidate_sets.select().eq().single() → relationship lookup
    // 3) RPC create_interaction → returns new interaction id
    q.single
      .mockResolvedValueOnce({
        data: {
          id: "ca-s1",
          owner_id: "u-1",
          candidate_set_id: "cs-1",
          type: "ScheduleInteraction",
          decision_state: "picked",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "cs-1", relationship_id: "r-1" },
        error: null,
      });
    q.rpc.mockResolvedValueOnce({ data: "i-planned-1", error: null });

    const result = await executor.execute({
      action: {
        id: "ca-s1",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "ScheduleInteraction",
        payload: {
          time: "2026-05-22T17:00:00Z",
          kind: "coffee",
          notes: "Sam's spot",
          contactIds: ["c-sam"],
        },
      },
    });

    expect(result.kind).toBe("picked");
    expect(q.rpc).toHaveBeenCalledWith(
      "create_interaction",
      expect.objectContaining({
        p_time: "2026-05-22T17:00:00Z",
        p_kind: "coffee",
        p_notes: "Sam's spot",
        p_status: "planned",
        p_contact_ids: ["c-sam"],
      }),
    );
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ decision_state: "picked" }),
    );
    expect(scheduleTriggeredPass).toHaveBeenCalledWith(
      expect.objectContaining({ relationshipId: "r-1" }),
    );
    expect((result as { effects?: { interactionId?: string } }).effects?.interactionId)
      .toBe("i-planned-1");
  });

  it("honours user edits to time, notes, and contactIds before scheduling", async () => {
    const { q, executor } = withExecutor();
    q.single
      .mockResolvedValueOnce({ data: { id: "ca-s2" }, error: null })
      .mockResolvedValueOnce({
        data: { id: "cs-1", relationship_id: "r-1" },
        error: null,
      });
    q.rpc.mockResolvedValueOnce({ data: "i-planned-2", error: null });

    await executor.execute({
      action: {
        id: "ca-s2",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "ScheduleInteraction",
        payload: {
          time: "2026-05-22T17:00:00Z",
          kind: "coffee",
          contactIds: ["c-sam"],
        },
      },
      userEdits: {
        payload: {
          time: "2026-05-23T18:00:00Z",
          kind: "coffee",
          notes: "user moved it a day later",
          contactIds: ["c-sam", "c-jules"],
        },
      },
    });

    expect(q.rpc).toHaveBeenCalledWith(
      "create_interaction",
      expect.objectContaining({
        p_time: "2026-05-23T18:00:00Z",
        p_notes: "user moved it a day later",
        p_contact_ids: ["c-sam", "c-jules"],
      }),
    );
  });
});

describe("Executor.execute — LogInteraction", () => {
  it("creates an `occurred` Interaction via create_interaction RPC", async () => {
    const { q, executor } = withExecutor();
    q.single
      .mockResolvedValueOnce({ data: { id: "ca-l1" }, error: null })
      .mockResolvedValueOnce({
        data: { id: "cs-1", relationship_id: "r-1" },
        error: null,
      });
    q.rpc.mockResolvedValueOnce({ data: "i-occurred-1", error: null });

    await executor.execute({
      action: {
        id: "ca-l1",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "LogInteraction",
        payload: {
          time: "2026-05-18T20:00:00Z",
          kind: "dinner",
          contactIds: ["c-sam"],
        },
      },
    });

    expect(q.rpc).toHaveBeenCalledWith(
      "create_interaction",
      expect.objectContaining({
        p_kind: "dinner",
        p_status: "occurred",
        p_contact_ids: ["c-sam"],
      }),
    );
  });
});

describe("Executor.execute — OpenThread", () => {
  it("creates an Open Thread on the focused Relationship via create_open_thread RPC", async () => {
    const { q, executor, scheduleTriggeredPass } = withExecutor();
    // Order:
    //   1) relationshipIdForSet (NEW: looked up early so the RPC receives it)
    //   2) RPC create_open_thread
    //   3) update candidate_actions
    //   4) (no further lookup — scheduleTriggeredPass reuses the cached id)
    q.single
      .mockResolvedValueOnce({
        // 1st single: candidate_sets → relationship lookup (now before update)
        data: { id: "cs-1", relationship_id: "r-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        // 2nd single: candidate_actions update().eq().select().single()
        data: { id: "ca-o1" },
        error: null,
      });
    q.rpc.mockResolvedValueOnce({ data: "ot-new", error: null });

    const result = await executor.execute({
      action: {
        id: "ca-o1",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "OpenThread",
        payload: {
          description: "send Sam the book",
          direction: "me_owes_them",
        },
      },
    });

    expect(result.kind).toBe("picked");
    expect(q.rpc).toHaveBeenCalledWith(
      "create_open_thread",
      expect.objectContaining({
        p_description: "send Sam the book",
        p_direction: "me_owes_them",
        p_relationship_ids: ["r-1"],
      }),
    );
    expect(scheduleTriggeredPass).toHaveBeenCalledWith(
      expect.objectContaining({ relationshipId: "r-1" }),
    );
  });
});

describe("Executor.execute — CloseThread", () => {
  it("updates open_threads.closed_at on the targeted thread, records the decision, and schedules a Triggered Pass", async () => {
    const { q, executor, scheduleTriggeredPass } = withExecutor();
    q.single
      .mockResolvedValueOnce({
        // open_threads update().eq().select().single()
        data: { id: "ot-1", closed_at: "2026-05-19T00:00:00Z" },
        error: null,
      })
      .mockResolvedValueOnce({
        // candidate_actions update().eq().select().single()
        data: { id: "ca-c1" },
        error: null,
      })
      .mockResolvedValueOnce({
        // candidate_sets select().eq().single() → relationship lookup
        data: { id: "cs-1", relationship_id: "r-1" },
        error: null,
      });

    const result = await executor.execute({
      action: {
        id: "ca-c1",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "CloseThread",
        payload: { openThreadId: "ot-1" },
      },
    });

    expect(result.kind).toBe("picked");
    // The update was called on open_threads first.
    expect(q.from).toHaveBeenCalledWith("open_threads");
    // Composite checks — closed_at set, decision_state recorded, Triggered Pass.
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ closed_at: expect.any(String) }),
    );
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ decision_state: "picked" }),
    );
    expect(scheduleTriggeredPass).toHaveBeenCalledWith(
      expect.objectContaining({ relationshipId: "r-1" }),
    );
  });
});

describe("Executor.execute — UpdateRoleOrCadence", () => {
  it("updates the focused Relationship's role and/or cadence, records the decision, and schedules a Triggered Pass", async () => {
    const { q, executor, scheduleTriggeredPass } = withExecutor();
    q.single
      .mockResolvedValueOnce({
        // candidate_sets select().eq().single() → relationship lookup (early)
        data: { id: "cs-1", relationship_id: "r-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        // relationships update().eq().select().single()
        data: { id: "r-1", role: "close friend", cadence: "weekly" },
        error: null,
      })
      .mockResolvedValueOnce({
        // candidate_actions update().eq().select().single()
        data: { id: "ca-u1" },
        error: null,
      });

    const result = await executor.execute({
      action: {
        id: "ca-u1",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "UpdateRoleOrCadence",
        payload: { role: "close friend", cadence: "weekly" },
      },
    });

    expect(result.kind).toBe("picked");
    expect(q.from).toHaveBeenCalledWith("relationships");
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ role: "close friend", cadence: "weekly" }),
    );
    expect(scheduleTriggeredPass).toHaveBeenCalledWith(
      expect.objectContaining({ relationshipId: "r-1" }),
    );
  });

  it("only sends the fields the action specifies — partial updates leave the others alone", async () => {
    const { q, executor } = withExecutor();
    q.single
      .mockResolvedValueOnce({
        data: { id: "cs-1", relationship_id: "r-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "r-1", role: "mentor" },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: "ca-u2" }, error: null });

    await executor.execute({
      action: {
        id: "ca-u2",
        candidateSetId: "cs-1",
        ownerId: "u-1",
        type: "UpdateRoleOrCadence",
        payload: { role: "mentor" },
      },
    });

    const updateCalls = (q.update.mock.calls as unknown as Array<Array<Record<string, unknown>>>);
    const relUpdateCall = updateCalls.find(
      (args) => args[0]?.role !== undefined,
    );
    expect(relUpdateCall?.[0]).toEqual({ role: "mentor" });
  });
});
