// suggest-values-characters — proposes similar media characters based on the
// User's right-swipes to narrow the Values Discovery queue.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy suggest-values-characters

import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are the adaptive character suggestion step for Related's Values Discovery.

The User swipes on famous media characters (film, TV, anime, games, sports, history, literature) to find whose values align with who they want to be.

Given who they ALIGNED with (right swipe), who they REJECTED (left swipe), and IDs to EXCLUDE (already seen), propose NEW characters that narrow in on their taste.

Rules:
- Return 6–8 characters not in the exclude list.
- Stay similar in VALUES and archetype to aligned characters — not just the same franchise.
- Use rejections as contrast: avoid characters that embody what they rejected.
- Broaden slightly when aligned list is short; narrow when they have several aligns.
- Cover diverse media (film, TV, anime, games, sports icons, historical figures) unless their aligns are very narrow.
- Each character needs: id (kebab-case slug from name), name, source (show/film/etc), values (exactly 4 short trait words).
- Real famous characters only — no originals.
- Return ONLY valid JSON: { "characters": [{ "id", "name", "source", "values": ["...", ...] }, ...] }`;

interface SuggestCharacter {
  id: string;
  name: string;
  source: string;
  values: string[];
}

interface SuggestPayload {
  aligned: SuggestCharacter[];
  rejected: SuggestCharacter[];
  excludeIds: string[];
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

// Duplicate of slugifyCharacterId in src/shared/src/values/valuesCharacters.ts — keep in sync.
function slugifyCharacterId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatList(characters: SuggestCharacter[]): string {
  if (characters.length === 0) return "(none)";
  return characters
    .map(
      (c) =>
        `- ${c.name} (${c.source}): ${c.values.join(", ")} [id=${c.id}]`,
    )
    .join("\n");
}

function parseCharacters(text: string, excludeIds: Set<string>): SuggestCharacter[] {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonText) as { characters?: unknown };
  if (!Array.isArray(parsed.characters)) {
    throw new Error("response missing characters array");
  }

  const results: SuggestCharacter[] = [];
  const seen = new Set<string>();

  for (const raw of parsed.characters) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const source = typeof item.source === "string" ? item.source.trim() : "";
    if (!name || !source) continue;

    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : slugifyCharacterId(name);
    if (excludeIds.has(id) || seen.has(id)) continue;

    const valuesRaw = item.values;
    if (!Array.isArray(valuesRaw)) continue;
    const values = valuesRaw
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 4);
    if (values.length < 4) continue;

    seen.add(id);
    results.push({ id, name, source, values });
    if (results.length >= 8) break;
  }

  if (results.length === 0) {
    throw new Error("characters array was empty after filtering");
  }
  return results;
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

  let body: Partial<SuggestPayload>;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }

  const aligned = Array.isArray(body.aligned) ? body.aligned : [];
  const rejected = Array.isArray(body.rejected) ? body.rejected : [];
  const excludeIds = Array.isArray(body.excludeIds)
    ? body.excludeIds.filter((id): id is string => typeof id === "string")
    : [];

  if (aligned.length === 0) {
    return jsonError(400, "need at least one aligned character to suggest");
  }

  const excludeSet = new Set(excludeIds);

  const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonError(401, "auth failed");
  }

  const userMessage = `Characters the User ALIGNED with:
${formatList(aligned)}

Characters the User REJECTED:
${formatList(rejected)}

Exclude these character ids (already seen — do NOT return any of them):
${excludeIds.length ? excludeIds.join(", ") : "(none)"}

Propose 6–8 NEW characters to narrow their taste. Return JSON only.`;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let characters: SuggestCharacter[];
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
    characters = parseCharacters(text, excludeSet);
  } catch (err) {
    return jsonError(
      502,
      `suggestion failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return new Response(JSON.stringify({ characters }), {
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
});
