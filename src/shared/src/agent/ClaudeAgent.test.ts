import { AMBIENT_SYSTEM_PROMPT } from "./ambientAgentCore";
import { ClaudeAgent, type AnthropicMessagesClient } from "./ClaudeAgent";
import type { AgentPrompt } from "./PassEngine";
import {
  testContact,
  testOpenThreadLink,
  testRelationshipContextSnapshot,
} from "./relationshipContextFixtures";

function samplePrompt(over: Partial<AgentPrompt> = {}): AgentPrompt {
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
    expect(req.system).toBe(AMBIENT_SYSTEM_PROMPT);
    expect(req.system).toContain("operatorStrengths");
    expect(req.system).toContain("Capability fit");
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
      relationshipContext: testRelationshipContextSnapshot({
        openThreads: [
          testOpenThreadLink({
            description: "promised to send the book",
          }),
        ],
      }),
      previousCandidateSet: { id: "cs-prev", mode: "baseline", actions: [] },
      userContext: {
        userId: "u-1",
        asOf: "2026-05-19T00:00:00Z",
        transientIntent: ["plan a low-key catch-up"],
        situationalState: {
          id: "ss-1",
          content: "Just moved to Sydney",
          createdAt: "2026-05-01T00:00:00Z",
          updatedAt: "2026-05-19T00:00:00Z",
        },
        goalsAndValues: [
          {
            id: "g-1",
            content: "Be more present with family",
            createdAt: "2026-05-01T00:00:00Z",
            updatedAt: "2026-05-01T00:00:00Z",
          },
        ],
        operatorStrengths: [
          {
            id: "os-1",
            content: "A good ear when someone's stuck",
            createdAt: "2026-05-01T00:00:00Z",
            updatedAt: "2026-05-01T00:00:00Z",
          },
        ],
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

  it("defaults to DoNothing when the model emits no tool calls", async () => {
    const { client } = mockClientReturning([]);
    const agent = new ClaudeAgent({ client });

    const actions = await agent.propose(samplePrompt());

    expect(actions).toEqual([{ type: "DoNothing", payload: {} }]);
  });

  it("returns a single concrete action without appending DoNothing", async () => {
    const { client } = mockClientReturning([
      {
        type: "tool_use",
        name: "schedule_interaction",
        input: { time: "2026-05-22T17:00:00Z", kind: "coffee", contactIds: ["c-1"] },
      },
    ]);
    const agent = new ClaudeAgent({ client });

    const actions = await agent.propose(samplePrompt());

    expect(actions).toEqual([
      {
        type: "ScheduleInteraction",
        payload: {
          time: "2026-05-22T17:00:00Z",
          kind: "coffee",
          contactIds: ["c-1"],
        },
      },
    ]);
  });

  it("keeps a single DoNothing when the model already emitted one", async () => {
    const { client } = mockClientReturning([
      { type: "tool_use", name: "do_nothing", input: { why: "model's reason" } },
    ]);
    const agent = new ClaudeAgent({ client });

    const actions = await agent.propose(samplePrompt());
    expect(actions.filter((a) => a.type === "DoNothing")).toHaveLength(1);
    expect(actions[0].why).toBe("model's reason");
  });

  it("keeps only the first non-DoNothing when the model emits multiple tool calls", async () => {
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

    expect(actions).toEqual([
      {
        type: "ScheduleInteraction",
        payload: {
          time: "2026-05-22T17:00:00Z",
          kind: "coffee",
          contactIds: ["c-1"],
        },
        why: "Sam's birthday week",
      },
    ]);
  });

  it("keeps the first DoNothing when the model emits multiple DoNothing tool calls", async () => {
    const { client } = mockClientReturning([
      { type: "tool_use", name: "do_nothing", input: { why: "first reason" } },
      { type: "tool_use", name: "do_nothing", input: { why: "second reason" } },
    ]);
    const agent = new ClaudeAgent({ client });

    const actions = await agent.propose(samplePrompt());

    expect(actions).toEqual([
      { type: "DoNothing", payload: {}, why: "first reason" },
    ]);
  });
});
