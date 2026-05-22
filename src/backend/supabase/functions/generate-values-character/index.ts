// generate-values-character — suggest one character from alignments, then
// Seedance 2.0 video → values-media storage. Async via start + poll.
//
// Deploy:
//   supabase secrets set REPLICATE_API_TOKEN=r8_...
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy generate-values-character

import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import { createClient } from "npm:@supabase/supabase-js@^2.45.0";
import { buildVideoPrompt } from "../_shared/valuesVideoPrompt.ts";
import {
  downloadVideoBytes,
  extractVideoUrl,
  replicateCreatePrediction,
  replicateGetPrediction,
  replicateModel,
  ReplicateValuesError,
  buildSeedanceInput,
} from "../_shared/valuesReplicate.ts";

const MODEL = "claude-sonnet-4-6";
const BUCKET = "values-media";
const SUGGEST_SYSTEM = `You are the adaptive character suggestion step for Related's Values Discovery.

Given who the User ALIGNED with, who they REJECTED, and ids to EXCLUDE, propose exactly ONE new famous media character that narrows their taste.

Return ONLY valid JSON:
{ "character": { "id": "kebab-case", "name": "...", "source": "...", "values": ["...", "...", "...", "..."] } }

Rules:
- Real famous characters only.
- Exactly 4 short value trait words.
- id must not be in the exclude list.
- Stay similar in values and archetype to aligned characters.`;

interface SuggestCharacter {
  id: string;
  name: string;
  source: string;
  values: string[];
}

interface AlignmentsBody {
  aligned?: SuggestCharacter[];
  rejected?: SuggestCharacter[];
  excludeIds?: string[];
  character?: SuggestCharacter;
  predictionId?: string;
  action?: "start" | "poll";
}

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

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
    .map((c) => `- ${c.name} (${c.source}): ${c.values.join(", ")} [id=${c.id}]`)
    .join("\n");
}

function parseOneCharacter(
  text: string,
  excludeIds: Set<string>,
): SuggestCharacter {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(jsonText) as {
    character?: Record<string, unknown>;
    characters?: Record<string, unknown>[];
  };

  const raw = parsed.character ??
    (Array.isArray(parsed.characters) ? parsed.characters[0] : null);
  if (!raw || typeof raw !== "object") {
    throw new Error("response missing character");
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  if (!name || !source) throw new Error("incomplete character");

  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : slugifyCharacterId(name);
  if (excludeIds.has(id)) throw new Error("character id excluded");

  const valuesRaw = raw.values;
  if (!Array.isArray(valuesRaw)) throw new Error("missing values");
  const values = valuesRaw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (values.length < 4) throw new Error("need 4 values");

  return { id, name, source, values };
}

async function suggestOneCharacter(
  aligned: SuggestCharacter[],
  rejected: SuggestCharacter[],
  excludeIds: string[],
): Promise<SuggestCharacter> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const excludeSet = new Set(excludeIds);

  const userMessage = `Characters the User ALIGNED with:
${formatList(aligned)}

Characters the User REJECTED:
${formatList(rejected)}

Exclude these ids (do NOT return any):
${excludeIds.length ? excludeIds.join(", ") : "(none)"}

Propose exactly ONE NEW character. Return JSON only.`;

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SUGGEST_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = (resp.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => ("text" in block ? block.text : ""))
    .join("\n")
    .trim();

  if (!text) throw new Error("empty model response");
  return parseOneCharacter(text, excludeSet);
}

function publicVideoUrl(characterId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${characterId}.mp4`;
}

async function storageClipExists(
  admin: ReturnType<typeof createClient>,
  characterId: string,
): Promise<boolean> {
  const { data, error } = await admin.storage.from(BUCKET).list("", {
    search: `${characterId}.mp4`,
    limit: 1,
  });
  if (error) return false;
  return (data ?? []).some((obj) => obj.name === `${characterId}.mp4`);
}

async function uploadClip(
  admin: ReturnType<typeof createClient>,
  characterId: string,
  bytes: Uint8Array,
): Promise<string> {
  const objectPath = `${characterId}.mp4`;
  const { error } = await admin.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw error;
  return publicVideoUrl(characterId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(401, { error: "missing_authorization" });

  let body: AlignmentsBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const action = body.action ?? "start";
  const userClient = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const userRes = await userClient.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonResponse(401, { error: "auth_failed" });
  }

  const admin = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "poll") {
    if (!REPLICATE_API_TOKEN) {
      return jsonResponse(500, { error: "replicate_not_configured" });
    }
    const predictionId = body.predictionId;
    const character = body.character;
    if (!predictionId || !character?.id) {
      return jsonResponse(400, { error: "missing_prediction_or_character" });
    }

    try {
      const existing = await storageClipExists(admin, character.id);
      if (existing) {
        const videoUrl = publicVideoUrl(character.id);
        return jsonResponse(200, {
          status: "ready",
          phase: "complete",
          character: { ...character, videoUrl, mediaMuxed: true },
          videoUrl,
        });
      }

      const prediction = await replicateGetPrediction(
        REPLICATE_API_TOKEN,
        predictionId,
      );

      if (prediction.status === "processing" || prediction.status === "starting") {
        return jsonResponse(200, {
          status: "processing",
          phase: "video",
          predictionId,
          character,
        });
      }

      if (prediction.status === "failed" || prediction.status === "canceled") {
        return jsonResponse(502, {
          status: "error",
          code: "generation_failed",
          message: prediction.error ?? "Video generation failed",
          character,
        });
      }

      const rawUrl = extractVideoUrl(prediction.output);
      const bytes = await downloadVideoBytes(rawUrl);
      const videoUrl = await uploadClip(admin, character.id, bytes);

      return jsonResponse(200, {
        status: "ready",
        phase: "complete",
        character: { ...character, videoUrl, mediaMuxed: true },
        videoUrl,
      });
    } catch (err) {
      if (err instanceof ReplicateValuesError) {
        return jsonResponse(err.code === "insufficient_credits" ? 402 : 502, {
          status: "error",
          code: err.code,
          message: err.message,
          character,
        });
      }
      return jsonResponse(502, {
        status: "error",
        code: "generation_failed",
        message: err instanceof Error ? err.message : String(err),
        character,
      });
    }
  }

  // action === "start"
  const aligned = Array.isArray(body.aligned) ? body.aligned : [];
  const rejected = Array.isArray(body.rejected) ? body.rejected : [];
  const excludeIds = Array.isArray(body.excludeIds)
    ? body.excludeIds.filter((id): id is string => typeof id === "string")
    : [];

  if (!REPLICATE_API_TOKEN) {
    return jsonResponse(500, { error: "replicate_not_configured" });
  }

  let character = body.character;
  try {
    if (!character) {
      if (aligned.length === 0) {
        return jsonResponse(400, {
          error: "need_aligned_or_character",
          message: "Provide alignment context or a character draft",
        });
      }
      character = await suggestOneCharacter(aligned, rejected, excludeIds);
    }

    const existing = await storageClipExists(admin, character.id);
    if (existing) {
      const videoUrl = publicVideoUrl(character.id);
      return jsonResponse(200, {
        status: "ready",
        phase: "complete",
        character: { ...character, videoUrl, mediaMuxed: true },
        videoUrl,
      });
    }

    const prompt = buildVideoPrompt(character);
    const prediction = await replicateCreatePrediction(
      REPLICATE_API_TOKEN,
      replicateModel(),
      buildSeedanceInput(prompt),
    );

    return jsonResponse(200, {
      status: "processing",
      phase: "video",
      predictionId: prediction.id,
      character,
    });
  } catch (err) {
    if (err instanceof ReplicateValuesError) {
      return jsonResponse(err.code === "insufficient_credits" ? 402 : 502, {
        status: "error",
        code: err.code,
        message: err.message,
        character: character ?? null,
      });
    }
    const code = err instanceof Error && err.message.includes("suggest")
      ? "suggestion_failed"
      : "generation_failed";
    return jsonResponse(502, {
      status: "error",
      code,
      message: err instanceof Error ? err.message : String(err),
      character: character ?? null,
    });
  }
});
