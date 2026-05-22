import {
  AMBIENT_SYSTEM_PROMPT,
  buildAmbientUserMessage,
  parseAmbientToolResults,
} from "./ambientAgentCore";

describe("AMBIENT_SYSTEM_PROMPT", () => {
  it("includes Operator Profile capability-fit rules", () => {
    expect(AMBIENT_SYSTEM_PROMPT).toContain("operatorStrengths");
    expect(AMBIENT_SYSTEM_PROMPT).toContain("Capability fit");
  });
});

describe("buildAmbientUserMessage", () => {
  it("serialises mode, contexts, and null liveContext", () => {
    const body = buildAmbientUserMessage({
      mode: "baseline",
      relationshipContext: { relationship: { id: "r-1" } },
      previousCandidateSet: { id: "cs-1" },
      userContext: { userId: "u-1", operatorStrengths: [] },
    });
    const parsed = JSON.parse(body);
    expect(parsed.mode).toBe("baseline");
    expect(parsed.relationshipContext).toEqual({ relationship: { id: "r-1" } });
    expect(parsed.previousCandidateSet).toEqual({ id: "cs-1" });
    expect(parsed.userContext).toEqual({ userId: "u-1", operatorStrengths: [] });
    expect(parsed.liveContext).toBeNull();
  });

  it("preserves liveContext when provided", () => {
    const body = buildAmbientUserMessage({
      mode: "engaged",
      relationshipContext: {},
      previousCandidateSet: null,
      userContext: {},
      liveContext: { intent: "catch up lightly" },
    });
    expect(JSON.parse(body).liveContext).toEqual({ intent: "catch up lightly" });
  });
});

describe("parseAmbientToolResults", () => {
  it("maps tool_use blocks to typed actions with why separated", () => {
    expect(
      parseAmbientToolResults([
        {
          type: "tool_use",
          name: "do_nothing",
          input: { why: "no material change" },
        },
      ]),
    ).toEqual([
      { type: "DoNothing", payload: {}, why: "no material change" },
    ]);
  });

  it("defaults to DoNothing when content is empty", () => {
    expect(parseAmbientToolResults([])).toEqual([
      { type: "DoNothing", payload: {} },
    ]);
  });

  it("keeps only the first concrete action when multiple tool calls are returned", () => {
    expect(
      parseAmbientToolResults([
        {
          type: "tool_use",
          name: "schedule_interaction",
          input: {
            time: "2026-05-22T17:00:00Z",
            kind: "coffee",
            contactIds: ["c-1"],
            why: "birthday week",
          },
        },
        {
          type: "tool_use",
          name: "log_interaction",
          input: {
            time: "2026-05-18T20:00:00Z",
            kind: "dinner",
            contactIds: ["c-1"],
          },
        },
      ]),
    ).toEqual([
      {
        type: "ScheduleInteraction",
        payload: {
          time: "2026-05-22T17:00:00Z",
          kind: "coffee",
          contactIds: ["c-1"],
        },
        why: "birthday week",
      },
    ]);
  });
});
