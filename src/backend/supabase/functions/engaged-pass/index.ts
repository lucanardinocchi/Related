// Engaged Pass Edge Function — wraps the Sonnet 4.6 call server-side so the
// ANTHROPIC_API_KEY never reaches the client bundle. The client sends an
// AgentPrompt; this function runs ClaudeAgent.propose against the live SDK
// and returns the parsed CandidateActionInput[].
//
// Deploy:
//   supabase functions deploy engaged-pass --no-verify-jwt=false
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Runtime: Deno (Supabase Edge Runtime). Prompt, tools, and parser imported
// from @related/shared via relative path (see ambientAgentCore.ts).

// deno-lint-ignore-file no-explicit-any
import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import {
  AMBIENT_SYSTEM_PROMPT,
  AMBIENT_TOOLS,
  buildAmbientUserMessage,
  parseAmbientToolResults,
  type AmbientPromptInput,
} from "../../../../shared/src/agent/ambientAgentCore.ts";

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.warn("ANTHROPIC_API_KEY is not set in the function environment");
}
const anthropic = new Anthropic({ apiKey });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }
  let body: { prompt?: AmbientPromptInput };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const prompt = body.prompt;
  if (!prompt || typeof prompt.mode !== "string") {
    return new Response(
      JSON.stringify({ error: "missing or malformed `prompt`" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: AMBIENT_SYSTEM_PROMPT,
      tools: AMBIENT_TOOLS as any,
      messages: [{ role: "user", content: buildAmbientUserMessage(prompt) }],
    });
    const actions = parseAmbientToolResults(response.content);
    return new Response(JSON.stringify({ actions }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
});
