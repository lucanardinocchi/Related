import Anthropic from "@anthropic-ai/sdk";
import { ClaudeAgent, type AnthropicMessagesClient } from "./ClaudeAgent";
import type { AgentPrompt } from "./PassEngine";
import {
  testContact,
  testOpenThreadLink,
  testRelationshipContextSnapshot,
} from "./relationshipContextFixtures";

/**
 * Real-LLM smoke test — hits the Anthropic API with the live key, asserts the
 * agent returns a structurally valid Candidate Set across the full ontology
 * for a representative fixture. This is the contract: the agent must produce
 * typed actions, exactly one action per Pass, and at least one
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
      mode: "baseline",
      relationshipContext: testRelationshipContextSnapshot({
        relationship: {
          id: "r-1",
          target_type: "contact",
          role: "close friend",
          cadence: "every couple of weeks",
        },
        openThreads: [
          testOpenThreadLink({
            id: "ot-1",
            description: "promised to send Sam the book on Stoicism",
            created_at: "2026-05-08T00:00:00Z",
          }),
        ],
        contact: testContact({ id: "c-sam", name: "Sam" }),
      }),
      previousCandidateSet: null,
      userContext: {
        userId: "u-1",
        asOf: "2026-05-19T00:00:00Z",
        transientIntent: [
          "I want to plan a low-key catch-up with Sam this week",
        ],
        situationalState: {
          id: "ss-1",
          content: "Just moved to Sydney; settling in",
          createdAt: "2026-05-01T00:00:00Z",
          updatedAt: "2026-05-19T00:00:00Z",
        },
        goalsAndValues: [
          {
            id: "g-1",
            content: "Be present with close friends, not just family",
            createdAt: "2026-05-01T00:00:00Z",
            updatedAt: "2026-05-01T00:00:00Z",
          },
        ],
        operatorStrengths: [
          {
            id: "os-1",
            content: "A good ear when a close friend's stuck",
            createdAt: "2026-05-01T00:00:00Z",
            updatedAt: "2026-05-01T00:00:00Z",
          },
          {
            id: "os-2",
            content: "Help thinking through career moves",
            createdAt: "2026-05-02T00:00:00Z",
            updatedAt: "2026-05-02T00:00:00Z",
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
      liveContext: { sessionId: "sess-test", userTurn: "what should I do about Sam" },
    };

    const actions = await agent.propose(prompt);

    // Surfaced for the human-review-of-output-quality acceptance gate.
    // eslint-disable-next-line no-console
    console.log("LIVE Engaged Pass output:", JSON.stringify(actions, null, 2));

    // Structural invariants the issue calls out:
    expect(actions).toHaveLength(1);
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
    // Exactly one Candidate Action per Pass.
    expect(actions).toHaveLength(1);
    // The model proposed a concrete action (not just DoNothing)
    // given an Open Thread + live intent + a "be present" goal.
    expect(actions[0].type).not.toBe("DoNothing");
  }, 60_000);
});
