// extract-context Edge Function — Relationship context Extraction Pass per
// ADR-0012. Runs over a closed Chat transcript (Conversational or Pocket)
// and direct-writes notes, interactions, comms, and commitments with
// provenance stamped on every row.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy extract-context
//
// deno-lint-ignore-file no-explicit-any

import Anthropic from "npm:@anthropic-ai/sdk@^0.96.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

import {
  bumpSummary,
  dispatchTool,
  emptySummary,
} from "./dispatch.ts";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt.ts";
import {
  formatRelationshipDirectory,
  formatTranscript,
  loadChat,
  loadExistingContextSummary,
  loadMessages,
  loadRelationshipDirectory,
} from "./queries.ts";
import { EXTRACTION_TOOLS } from "./tools.ts";
import type { CaptureSource, ExtractionSummary, ToolContext } from "./types.ts";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const MAX_ROUNDS = 8;

async function runExtraction(
  anthropic: Anthropic,
  userMessage: string,
  ctx: ToolContext,
): Promise<ExtractionSummary> {
  const summary = emptySummary();
  const working: Array<{
    role: "user" | "assistant";
    content: string | unknown[];
  }> = [{ role: "user", content: userMessage }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: EXTRACTION_TOOLS as any,
      messages: working as any,
    });

    const blocks = (resp.content ?? []) as Array<{
      type: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;

    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) return summary;

    working.push({ role: "assistant", content: blocks });

    const results = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          await dispatchTool(
            tu.name ?? "",
            (tu.input ?? {}) as Record<string, unknown>,
            ctx,
          );
          bumpSummary(summary, tu.name ?? "");
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: '{"ok":true}',
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          summary.toolErrors.push(`${tu.name}: ${message}`);
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error: ${message}`,
            is_error: true,
          };
        }
      }),
    );

    working.push({ role: "user", content: results });
  }

  return summary;
}

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

function captureSourceFromChat(source: string): CaptureSource {
  return source === "pocket" ? "pocket_extraction" : "conversational_extraction";
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

  let body: { chatId?: string; ownerId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }
  if (!body.chatId || typeof body.chatId !== "string") {
    return jsonError(400, "missing chatId");
  }

  const isServiceRole =
    SERVICE_ROLE_KEY &&
    authHeader === `Bearer ${SERVICE_ROLE_KEY}` &&
    typeof body.ownerId === "string";

  let supabase: SupabaseClient;
  let ownerId: string;

  if (isServiceRole) {
    supabase = createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "", {
      auth: { persistSession: false },
    });
    ownerId = body.ownerId!;
  } else {
    supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const userRes = await supabase.auth.getUser();
    if (userRes.error || !userRes.data.user) {
      return jsonError(401, "auth failed");
    }
    ownerId = userRes.data.user.id;
  }

  const chat = await loadChat(supabase, body.chatId);
  if (!chat) return jsonError(404, "chat not found");
  if (chat.owner_id !== ownerId) return jsonError(403, "not your chat");
  if (!chat.closed_at) {
    return jsonError(409, "chat is still open; close it before extraction");
  }
  if (chat.extracted_at) {
    return new Response(
      JSON.stringify({
        skipped: true,
        reason: "already extracted",
        extracted_at: chat.extracted_at,
      }),
      { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
    );
  }

  const rows = await loadMessages(supabase, body.chatId);
  if (rows.length === 0) {
    await supabase
      .from("chats")
      .update({ extracted_at: new Date().toISOString() })
      .eq("id", body.chatId);
    return new Response(
      JSON.stringify({
        skipped: true,
        reason: "empty transcript",
        notesLogged: 0,
        interactionsLogged: 0,
        commsLogged: 0,
        commitmentsOpened: 0,
      }),
      { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
    );
  }

  const [directory, existingContext] = await Promise.all([
    loadRelationshipDirectory(supabase),
    loadExistingContextSummary(supabase),
  ]);

  const transcript = formatTranscript(rows);
  const userMessage = buildUserMessage({
    chatTitle: chat.title,
    chatSource: chat.source ?? "conversational",
    closedAt: chat.closed_at,
    relationshipDirectory: formatRelationshipDirectory(directory),
    existingContext,
    transcript,
  });

  const ctx: ToolContext = {
    supabase,
    ownerId,
    chatId: body.chatId,
    captureSource: captureSourceFromChat(chat.source ?? "conversational"),
    defaultTime: chat.closed_at,
  };

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let summary: ExtractionSummary;
  try {
    summary = await runExtraction(anthropic, userMessage, ctx);
  } catch (err) {
    return jsonError(
      502,
      `extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const stamp = await supabase
    .from("chats")
    .update({ extracted_at: new Date().toISOString() })
    .eq("id", body.chatId)
    .select("extracted_at")
    .single();
  if (stamp.error) {
    return jsonError(
      500,
      `extraction succeeded but failed to mark chat extracted: ${stamp.error.message}`,
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      extracted_at: stamp.data.extracted_at,
      ...summary,
    }),
    { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
  );
});
