import { ClaudeAgent, type AnthropicMessagesClient } from "./ClaudeAgent";
import type { AgentPrompt } from "./PassEngine";

function samplePrompt(over: Partial<AgentPrompt> = {}): AgentPrompt {
  return {
    mode: "engaged",
    relationship: {
      id: "r-1",
      target_type: "contact",
      contact: { id: "c-1", name: "Sam" },
    },
    openThreads: [],
    previousCandidateSet: null,
    userContext: {
      userId: "u-1",
      asOf: "2026-05-19T00:00:00Z",
      transientIntent: [],
      situationalState: [],
      goalsAndValues: [],
      inferredSignals: { calendarDensity: null, sleep: null },
    },
    ...over,
  };
}

function mockClientReturning(blocks: unknown[]): {
  create: jest.Mock;
  client: AnthropicMessagesClient;
} {
  const create = jest.fn().mockResolvedValue({ content: blocks });
  return { create, client: { messages: { create } } };
}

describe("ClaudeAgent.propose", () => {
  it("calls Sonnet 4.6 and maps each tool_use block to a typed CandidateActionInput", async () => {
    const { create, client } = mockClientReturning([
      {
        type: "tool_use",
        name: "do_nothing",
        input: { why: "no material change since last Pass" },
      },
    ]);

    const agent = new ClaudeAgent({ client });
    const actions = await agent.propose(samplePrompt());

    expect(create).toHaveBeenCalledTimes(1);
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-sonnet-4-6");
    expect(actions).toEqual([
      {
        type: "DoNothing",
        payload: {},
        why: "no material change since last Pass",
      },
    ]);
  });

  it("offers a tool schema for every Candidate Action type in the ontology", async () => {
    const { create, client } = mockClientReturning([]);
    const agent = new ClaudeAgent({ client });

    await agent.propose(samplePrompt());

    const req = create.mock.calls[0][0] as { tools: Array<{ name: string }> };
    const toolNames = req.tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(
      [
        "close_thread",
        "do_nothing",
        "log_interaction",
        "open_thread",
        "schedule_interaction",
        "send_message",
        "update_role_or_cadence",
      ].sort(),
    );
  });

  it("serialises the Relationship, Open Threads, previous Candidate Set, and User Context into the user message", async () => {
    const { create, client } = mockClientReturning([]);
    const agent = new ClaudeAgent({ client });

    const prompt = samplePrompt({
      openThreads: [
        {
          open_threads: {
            id: "ot-1",
            description: "promised to send the book",
            direction: "me_owes_them",
            created_at: "2026-05-10T00:00:00Z",
          },
        },
      ],
      previousCandidateSet: { id: "cs-prev", mode: "baseline", actions: [] },
      userContext: {
        userId: "u-1",
        asOf: "2026-05-19T00:00:00Z",
        transientIntent: ["plan a low-key catch-up"],
        situationalState: ["Just moved to Sydney"],
        goalsAndValues: ["Be more present with family"],
        inferredSignals: { calendarDensity: null, sleep: null },
      },
    });

    await agent.propose(prompt);

    const req = create.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const body = req.messages[0].content;
    expect(body).toContain("Sam");
    expect(body).toContain("promised to send the book");
    expect(body).toContain("cs-prev");
    expect(body).toContain("plan a low-key catch-up");
    expect(body).toContain("Just moved to Sydney");
    expect(body).toContain("Be more present with family");
  });

  it("appends a DoNothing if the model didn't emit one, so it's always a peer option", async () => {
    const { client } = mockClientReturning([
      {
        type: "tool_use",
        name: "schedule_interaction",
        input: { time: "2026-05-22T17:00:00Z", kind: "coffee", contactIds: ["c-1"] },
      },
    ]);
    const agent = new ClaudeAgent({ client });

    const actions = await agent.propose(samplePrompt());
    const types = actions.map((a) => a.type);
    expect(types).toContain("DoNothing");
    expect(types[types.length - 1]).toBe("DoNothing");
  });

  it("does not double up DoNothing when the model already emitted one", async () => {
    const { client } = mockClientReturning([
      { type: "tool_use", name: "do_nothing", input: { why: "model's reason" } },
    ]);
    const agent = new ClaudeAgent({ client });

    const actions = await agent.propose(samplePrompt());
    expect(actions.filter((a) => a.type === "DoNothing")).toHaveLength(1);
    expect(actions[0].why).toBe("model's reason");
  });

  it("maps every tool_use name to its PascalCase action type", async () => {
    const { client } = mockClientReturning([
      {
        type: "tool_use",
        name: "schedule_interaction",
        input: {
          time: "2026-05-22T17:00:00Z",
          kind: "coffee",
          contactIds: ["c-1"],
          why: "Sam's birthday week",
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
      {
        type: "tool_use",
        name: "open_thread",
        input: { description: "follow up on intro", direction: "me_owes_them" },
      },
      {
        type: "tool_use",
        name: "close_thread",
        input: { openThreadId: "ot-1" },
      },
      {
        type: "tool_use",
        name: "send_message",
        input: { channel: "text", contactIds: ["c-1"], body: "thinking of you" },
      },
      {
        type: "tool_use",
        name: "update_role_or_cadence",
        input: { role: "close friend" },
      },
    ]);
    const agent = new ClaudeAgent({ client });

    const actions = await agent.propose(samplePrompt());

    const types = actions.map((a) => a.type);
    // The DoNothing at the end is the invariant — the model emitted six
    // non-DoNothing actions, so the agent appends one.
    expect(types).toEqual([
      "ScheduleInteraction",
      "LogInteraction",
      "OpenThread",
      "CloseThread",
      "SendMessage",
      "UpdateRoleOrCadence",
      "DoNothing",
    ]);
    expect(actions[0].payload).toEqual({
      time: "2026-05-22T17:00:00Z",
      kind: "coffee",
      contactIds: ["c-1"],
    });
    expect(actions[0].why).toBe("Sam's birthday week");
  });
});
