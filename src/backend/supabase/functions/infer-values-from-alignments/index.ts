// infer-values-from-alignments Edge Function — read-only AI inference for
// Values Discovery. Proposes first-person Goals & Values from the User's
// align/reject swipes on media characters. Does NOT write to the database.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy infer-values-from-alignments
//
// deno-lint-ignore-file no-explicit-any

import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are the Values Discovery inference step for Related — a relationship-intelligence app.

The User swiped through famous media characters, indicating which characters' values align with who they want to be (aligned) vs which do not (rejected).

Your job: analyze the patterns in who they aligned with vs rejected, and propose 3–5 concise first-person goal/value statements the User might want to live by.

Rules:
- Write as first-person goals, like "Be fiercely loyal to the people I choose" or "Protect the people I love, even when it's hard".
- Synthesize themes across aligned characters — don't just restate individual character trait lists.
- Use rejections as contrast: what they rejected helps clarify what they are NOT optimizing for.
- Each statement is one sentence. No numbering, no bullet characters in the strings themselves.
- Return ONLY valid JSON in this exact shape: { "proposedGoals": ["...", "..."] }
- proposedGoals must contain 3–5 strings.`;

interface InferenceCharacter {
  characterId: string;
  name: string;
  source: string;
  values: string[];
}

interface InferencePayload {
  aligned: InferenceCharacter[];
  rejected: InferenceCharacter[];
}

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function formatCharacterList(characters: InferenceCharacter[]): string {
  if (characters.length === 0) return "(none)";
  return characters
    .map(
      (c) =>
        `- ${c.name} (${c.source}): ${c.values.join(", ")} [id=${c.characterId}]`,
    )
    .join("\n");
}

function parseProposedGoals(text: string): string[] {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonText) as { proposedGoals?: unknown };
  if (!Array.isArray(parsed.proposedGoals)) {
    throw new Error("response missing proposedGoals array");
  }
  const goals = parsed.proposedGoals
    .filter((g): g is string => typeof g === "string")
    .map((g) => g.trim())
    .filter(Boolean);
  if (goals.length === 0) {
    throw new Error("proposedGoals array was empty");
  }
  return goals.slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return jsonError(405, "method not allowed");
  if (!ANTHROPIC_API_KEY) {
    return jsonError(500, "ANTHROPIC_API_KEY not configured");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError(401, "missing Authorization header");

  let body: Partial<InferencePayload>;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }

  const aligned = Array.isArray(body.aligned) ? body.aligned : null;
  const rejected = Array.isArray(body.rejected) ? body.rejected : null;
  if (!aligned || !rejected) {
    return jsonError(400, "missing aligned or rejected arrays");
  }

  const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonError(401, "auth failed");
  }

  if (aligned.length + rejected.length < 10) {
    return jsonError(
      400,
      "need at least 10 reviewed characters before inference",
    );
  }

  const userMessage = `Characters the User ALIGNED with (values resonate):
${formatCharacterList(aligned)}

Characters the User REJECTED (values do not resonate):
${formatCharacterList(rejected)}

Propose 3–5 first-person goal/value statements based on these patterns. Return JSON only.`;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let proposedGoals: string[];
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = (resp.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => ("text" in block ? block.text : ""))
      .join("\n")
      .trim();

    if (!text) throw new Error("empty model response");
    proposedGoals = parseProposedGoals(text);
  } catch (err) {
    return jsonError(
      502,
      `inference failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return new Response(JSON.stringify({ proposedGoals }), {
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
});
