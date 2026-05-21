// infer-values-from-alignments Edge Function — read-only AI inference for
// Values Discovery. Proposes a value set, attitude, and goals from the User's
// top-ranked character alignments. Does NOT write to the database.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy infer-values-from-alignments
//
// deno-lint-ignore-file no-explicit-any

import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1536;
const MIN_RANKED_TOP = 5;

const SYSTEM_PROMPT = `You are the Values Discovery inference step for Related — a relationship-intelligence app.

The User swiped through famous media characters and ranked their top 5 alignments (rank 1 = strongest resonance). Each character has four short value-trait words.

Your job: analyze patterns across the ranked top 5 to propose:
1. **proposedValueSet** — 4–6 concise value labels that capture what these characters share (single words or very short phrases, e.g. "Loyalty", "Protective courage").
2. **proposedAttitude** — 1–2 sentences describing how the User wants to show up in relationships and life. Frame as aspirational self-narrative ("You lead with…", "You show up as…"), not a clinical personality test or diagnosis.
3. **proposedGoals** — 3–5 first-person goal statements derived from the value set and attitude (e.g. "Stand up for the people I choose, even when it's costly").

Rules:
- Weight rank 1 highest and rank 5 lowest when synthesizing themes.
- Use rejected characters (if provided) as contrast — what they are NOT optimizing for.
- Do not restate individual character trait lists verbatim; synthesize across the set.
- Return ONLY valid JSON in this exact shape:
  { "proposedValueSet": ["...", "..."], "proposedAttitude": "...", "proposedGoals": ["...", "..."] }
- proposedValueSet must contain 4–6 strings; proposedAttitude must be non-empty; proposedGoals must contain 3–5 strings.`;

interface InferenceCharacter {
  characterId: string;
  name: string;
  source: string;
  values: string[];
}

interface RankedInferenceCharacter extends InferenceCharacter {
  rank: number;
}

interface RankedInferencePayload {
  rankedTop: RankedInferenceCharacter[];
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

function formatRankedList(characters: RankedInferenceCharacter[]): string {
  if (characters.length === 0) return "(none)";
  return characters
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map(
      (c) =>
        `- #${c.rank} ${c.name} (${c.source}): ${c.values.join(", ")} [id=${c.characterId}]`,
    )
    .join("\n");
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

function parseProposedProfile(text: string): {
  proposedValueSet: string[];
  proposedAttitude: string;
  proposedGoals: string[];
} {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonText) as {
    proposedValueSet?: unknown;
    proposedAttitude?: unknown;
    proposedGoals?: unknown;
  };

  if (!Array.isArray(parsed.proposedValueSet)) {
    throw new Error("response missing proposedValueSet array");
  }
  const proposedValueSet = parsed.proposedValueSet
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (proposedValueSet.length < 4) {
    throw new Error("proposedValueSet must contain at least 4 values");
  }

  if (typeof parsed.proposedAttitude !== "string") {
    throw new Error("response missing proposedAttitude string");
  }
  const proposedAttitude = parsed.proposedAttitude.trim();
  if (!proposedAttitude) {
    throw new Error("proposedAttitude was empty");
  }

  if (!Array.isArray(parsed.proposedGoals)) {
    throw new Error("response missing proposedGoals array");
  }
  const proposedGoals = parsed.proposedGoals
    .filter((goal): goal is string => typeof goal === "string")
    .map((goal) => goal.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (proposedGoals.length < 3) {
    throw new Error("proposedGoals must contain at least 3 goals");
  }

  return { proposedValueSet, proposedAttitude, proposedGoals };
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

  let body: Partial<RankedInferencePayload>;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }

  const rankedTop = Array.isArray(body.rankedTop) ? body.rankedTop : null;
  const rejected = Array.isArray(body.rejected) ? body.rejected : [];
  if (!rankedTop) {
    return jsonError(400, "missing rankedTop array");
  }

  const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonError(401, "auth failed");
  }

  if (rankedTop.length < MIN_RANKED_TOP) {
    return jsonError(
      400,
      `need at least ${MIN_RANKED_TOP} ranked characters before inference`,
    );
  }

  const userMessage = `User's TOP RANKED alignments (rank 1 = strongest resonance):
${formatRankedList(rankedTop)}

Characters the User REJECTED (values do not resonate):
${formatCharacterList(rejected)}

From the top 5 ranking, propose a common value set, attitude, and first-person goals. Return JSON only.`;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let profile: {
    proposedValueSet: string[];
    proposedAttitude: string;
    proposedGoals: string[];
  };
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
    profile = parseProposedProfile(text);
  } catch (err) {
    return jsonError(
      502,
      `inference failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return new Response(JSON.stringify(profile), {
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
});
