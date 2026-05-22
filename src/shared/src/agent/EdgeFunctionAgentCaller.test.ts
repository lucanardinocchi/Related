import type { SupabaseClient } from "@supabase/supabase-js";
import { EdgeFunctionAgentCaller } from "./EdgeFunctionAgentCaller";
import type { AgentPrompt } from "./PassEngine";
import { testRelationshipContextSnapshot } from "./relationshipContextFixtures";

function samplePrompt(): AgentPrompt {
  return {
    mode: "baseline",
    relationshipContext: testRelationshipContextSnapshot(),
    previousCandidateSet: null,
    userContext: {
      userId: "u-1",
      asOf: "2026-05-19T00:00:00Z",
      transientIntent: [],
      situationalState: null,
      goalsAndValues: [],
      operatorStrengths: [],
      inferredSignals: {
        calendarDensity: null,
        sleep: null,
        calendarEvents: [],
        sleepRecords: [],
      },
      groups: [],
      otherRelationships: [],
      characterValuesAlignment: [],
    },
  };
}

describe("EdgeFunctionAgentCaller.propose", () => {
  it("invokes the ambient-pass function with the prompt and returns the parsed actions", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: {
        actions: [
          { type: "DoNothing", payload: {}, why: "no change" },
          {
            type: "ScheduleInteraction",
            payload: { time: "2026-05-22T17:00:00Z", kind: "coffee", contactIds: ["c-1"] },
          },
        ],
      },
      error: null,
    });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;

    const caller = new EdgeFunctionAgentCaller({ supabase: supa });
    const prompt = samplePrompt();
    const actions = await caller.propose(prompt);

    expect(invoke).toHaveBeenCalledWith(
      "ambient-pass",
      expect.objectContaining({ body: { prompt } }),
    );
    expect(actions).toEqual([
      { type: "DoNothing", payload: {}, why: "no change" },
      {
        type: "ScheduleInteraction",
        payload: { time: "2026-05-22T17:00:00Z", kind: "coffee", contactIds: ["c-1"] },
      },
    ]);
  });

  it("throws if the Edge Function call returns an error", async () => {
    const invoke = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "function timeout" },
    });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const caller = new EdgeFunctionAgentCaller({ supabase: supa });

    await expect(caller.propose(samplePrompt())).rejects.toThrow(/function timeout/);
  });

  it("throws if the Edge Function response shape is missing actions", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { foo: "bar" }, error: null });
    const supa = { functions: { invoke } } as unknown as SupabaseClient;
    const caller = new EdgeFunctionAgentCaller({ supabase: supa });

    await expect(caller.propose(samplePrompt())).rejects.toThrow(/actions/i);
  });
});
