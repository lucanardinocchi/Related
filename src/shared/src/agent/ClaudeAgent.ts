import type { AgentCaller, AgentPrompt, CandidateActionInput } from "./agentPassRun";
import {
  AMBIENT_SYSTEM_PROMPT,
  AMBIENT_TOOLS,
  buildAmbientUserMessage,
  parseAmbientToolResults,
} from "./ambientAgentCore";

export interface AnthropicMessagesClient {
  messages: {
    create: (req: unknown) => Promise<{ content: unknown[] }>;
  };
}

export interface ClaudeAgentOptions {
  client: AnthropicMessagesClient;
}

export class ClaudeAgent implements AgentCaller {
  private readonly client: AnthropicMessagesClient;

  constructor(opts: ClaudeAgentOptions) {
    this.client = opts.client;
  }

  async propose(prompt: AgentPrompt): Promise<CandidateActionInput[]> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: AMBIENT_SYSTEM_PROMPT,
      tools: AMBIENT_TOOLS,
      messages: [{ role: "user", content: buildAmbientUserMessage(prompt) }],
    });

    return parseAmbientToolResults(response.content);
  }
}
