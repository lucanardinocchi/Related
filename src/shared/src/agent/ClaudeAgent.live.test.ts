import Anthropic from "@anthropic-ai/sdk";
import { ClaudeAgent, type AnthropicMessagesClient } from "./ClaudeAgent";
import type { AgentPrompt } from "./PassEngine";

/**
 * Real-LLM smoke test — hits the Anthropic API with the live key, asserts the
 * agent returns a structurally valid Candidate Set across the full ontology
 * for a representative fixture. This is the contract: the agent must produce
 * typed actions, the DoNothing peer must be present, and at least one
 * concrete action (not just DoNothing) must come back when the Relationship
 * has Open Threads + Goals that warrant a response.
 *
 * Reads `ANTHROPIC_API_KEY` from .env.test (gitignored) via jest.setup.js.
 */
describe("ClaudeAgent.propose — live Anthropic call", () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  it("returns a structurally valid Candidate Set against Sonnet 4.6 with a real fixture", async () => {
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set — see src/shared/.env.test (gitignored).",
      );
    }
    const sdk = new Anthropic({ apiKey });
    // The SDK's overloaded signature isn't structurally assignable to the
    // generic interface, but the calls are compatible — cast at the boundary.
    const client: AnthropicMessagesClient = {
      messages: {
        create: (req) =>
          sdk.messages.create(req as Parameters<typeof sdk.messages.create>[0]) as Promise<{
            content: unknown[];
          }>,
      },
    };
    const agent = new ClaudeAgent({ client });

    const prompt: AgentPrompt = {
      mode: "engaged",
      relationship: {
        id: "r-1",
        target_type: "contact",
        contact: { id: "c-sam", name: "Sam" },
        role: "close friend",
        cadence: "every couple of weeks",
      },
      openThreads: [
        {
          open_threads: {
            id: "ot-1",
            description: "promised to send Sam the book on Stoicism",
            direction: "me_owes_them",
            created_at: "2026-05-08T00:00:00Z",
          },
        },
      ],
      previousCandidateSet: null,
      userContext: {
        userId: "u-1",
        asOf: "2026-05-19T00:00:00Z",
        transientIntent: [
          "I want to plan a low-key catch-up with Sam this week",
        ],
        situationalState: ["Just moved to Sydney; settling in"],
        goalsAndValues: ["Be present with close friends, not just family"],
        operatorStrengths: [
          "A good ear when a close friend's stuck",
          "Help thinking through career moves",
        ],
        inferredSignals: { calendarDensity: null, sleep: null },
      },
      liveContext: { sessionId: "sess-test", userTurn: "what should I do about Sam" },
    };

    const actions = await agent.propose(prompt);

    // Surfaced for the human-review-of-output-quality acceptance gate.
    // eslint-disable-next-line no-console
    console.log("LIVE Engaged Pass output:", JSON.stringify(actions, null, 2));

    // Structural invariants the issue calls out:
    expect(actions.length).toBeGreaterThan(1);
    // Every action has a known type from the ontology.
    const knownTypes = new Set([
      "ScheduleInteraction",
      "LogInteraction",
      "SendMessage",
      "OpenThread",
      "CloseThread",
      "UpdateRoleOrCadence",
      "DoNothing",
    ]);
    for (const a of actions) {
      expect(knownTypes.has(a.type)).toBe(true);
    }
    // DoNothing is always a peer option.
    expect(actions.some((a) => a.type === "DoNothing")).toBe(true);
    // The model proposed at least one concrete action (not just DoNothing)
    // given an Open Thread + live intent + a "be present" goal.
    expect(actions.some((a) => a.type !== "DoNothing")).toBe(true);
  }, 60_000);
});
