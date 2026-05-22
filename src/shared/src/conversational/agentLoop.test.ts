import {
  CONVERSATIONAL_MAX_TOOL_ROUNDS,
  createCallModel,
  runAgentToolLoop,
  streamingCallModel,
  TOOL_ROUND_LIMIT_MESSAGE,
} from "./agentLoop";
import type {
  AnthropicContentBlock,
  AnthropicCreateClient,
  AnthropicStreamingClient,
  CallModelFn,
} from "./agentLoop";

const TOOLS = [{ name: "lookup", description: "look up", input_schema: {} }];

function makeStreamingClient(rounds: AnthropicContentBlock[][]): AnthropicStreamingClient {
  let call = 0;
  return { messages: { stream() {
    const blocks = rounds[call++] ?? [{ type: "text", text: "fallback" }];
    return { on(event: string, handler: (d: string) => void) {
      if (event !== "text") return;
      for (const b of blocks) if (b.type === "text" && b.text) handler(b.text);
    }, finalMessage: async () => ({ content: blocks }) };
  }}};
}

function makeCreateClient(rounds: AnthropicContentBlock[][]): AnthropicCreateClient {
  let call = 0;
  return { messages: { create: async () => ({ content: rounds[call++] ?? [{ type: "text", text: "fallback" }] }) } };
}

describe("runAgentToolLoop", () => {
  it("returns assistant text when the model emits no tool uses", async () => {
    const result = await runAgentToolLoop({
      callModel: streamingCallModel(makeStreamingClient([[{ type: "text", text: "Hello there." }]])),
      system: "system", tools: TOOLS, messages: [{ role: "user", content: "Hi" }],
      dispatchTool: async () => ({}), model: "test-model", maxTokens: 1024, maxToolRounds: 4,
    });
    expect(result.text).toBe("Hello there.");
    expect(result.toolCalls).toHaveLength(0);
  });

  it("dispatches tools and continues until a final text turn", async () => {
    const dispatched: string[] = [];
    const result = await runAgentToolLoop({
      callModel: createCallModel(makeCreateClient([
        [{ type: "tool_use", id: "tu-1", name: "lookup", input: { q: "sam" } }],
        [{ type: "text", text: "Found Sam." }],
      ])),
      system: "system", tools: TOOLS, messages: [{ role: "user", content: "Who is Sam?" }],
      dispatchTool: async (name, input) => { dispatched.push(`${name}:${JSON.stringify(input)}`); return { matches: ["Sam Patel"] }; },
      model: "test-model", maxTokens: 1024, maxToolRounds: 4,
    });
    expect(dispatched).toEqual(['lookup:{"q":"sam"}']);
    expect(result.text).toBe("Found Sam.");
    expect(result.toolCalls).toHaveLength(1);
  });

  it("records tool errors without aborting the round", async () => {
    const result = await runAgentToolLoop({
      callModel: createCallModel(makeCreateClient([
        [{ type: "tool_use", id: "tu-err", name: "lookup", input: {} }],
        [{ type: "text", text: "Could not look up." }],
      ])),
      system: "system", tools: TOOLS, messages: [{ role: "user", content: "lookup" }],
      dispatchTool: async () => { throw new Error("db unavailable"); },
      model: "test-model", maxTokens: 1024, maxToolRounds: 4,
    });
    expect(result.toolCalls[0].error).toBe("db unavailable");
    expect(result.text).toBe("Could not look up.");
  });

  it("sets roundLimitMessage when the tool round cap is reached", async () => {
    const endlessTools: CallModelFn = async () => ({ content: [{ type: "tool_use", id: "tu-loop", name: "lookup", input: {} }] });
    const result = await runAgentToolLoop({
      callModel: endlessTools, system: "system", tools: TOOLS, messages: [{ role: "user", content: "loop" }],
      dispatchTool: async () => ({ ok: true }), model: "test-model", maxTokens: 1024, maxToolRounds: 2,
      roundLimitMessage: TOOL_ROUND_LIMIT_MESSAGE,
    });
    expect(result.text).toBe(TOOL_ROUND_LIMIT_MESSAGE);
    expect(result.toolCalls).toHaveLength(2);
  });

  it("leaves text empty on round limit when roundLimitMessage is omitted", async () => {
    const endlessTools: CallModelFn = async () => ({ content: [{ type: "tool_use", id: "tu-loop", name: "lookup", input: {} }] });
    const result = await runAgentToolLoop({
      callModel: endlessTools, system: "system", tools: TOOLS, messages: [{ role: "user", content: "loop" }],
      dispatchTool: async () => ({ ok: true }), model: "test-model", maxTokens: 1024,
      maxToolRounds: CONVERSATIONAL_MAX_TOOL_ROUNDS,
    });
    expect(result.text).toBe("");
    expect(result.toolCalls).toHaveLength(CONVERSATIONAL_MAX_TOOL_ROUNDS);
  });
});
