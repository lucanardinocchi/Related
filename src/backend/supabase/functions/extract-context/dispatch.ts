import type { ExtractionSummary, ToolContext } from "./types.ts";
import { resolveRelationship } from "./queries.ts";
import {
  contextCaptureInputFromExtractionTool,
  relationshipTargetFromResolved,
  resolveContextCapture,
  writeContextCapture,
  type ExtractionToolName,
} from "../_shared/contextCapture.ts";

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const toolName = name as ExtractionToolName;
  const captureInput = contextCaptureInputFromExtractionTool(
    toolName,
    input,
    ctx.defaultTime,
  );

  if (toolName === "open_commitment") {
    const relationshipIds = input.relationship_ids as string[];
    for (const relId of relationshipIds) {
      const rel = await resolveRelationship(ctx.supabase, relId);
      if (!rel) throw new Error(`relationship not found: ${relId}`);
      relationshipTargetFromResolved(rel);
    }
    const primaryRel = await resolveRelationship(
      ctx.supabase,
      relationshipIds[0]!,
    );
    if (!primaryRel) {
      throw new Error(`relationship not found: ${relationshipIds[0]}`);
    }
    const write = resolveContextCapture(captureInput, {
      captureSource: ctx.captureSource,
      sourceChatId: ctx.chatId,
      relationshipTarget: relationshipTargetFromResolved(primaryRel),
      relationshipIds,
    });
    const result = await writeContextCapture(write, {
      mode: "extraction",
      supabase: ctx.supabase,
      ownerId: ctx.ownerId,
      sourceChatId: ctx.chatId,
      captureSource: ctx.captureSource,
    });
    return { ok: true, open_thread_id: result.id };
  }

  const relationshipId = input.relationship_id as string;
  const rel = await resolveRelationship(ctx.supabase, relationshipId);
  if (!rel) throw new Error(`relationship not found: ${relationshipId}`);

  const write = resolveContextCapture(captureInput, {
    captureSource: ctx.captureSource,
    sourceChatId: ctx.chatId,
    relationshipTarget: relationshipTargetFromResolved(rel),
  });

  const result = await writeContextCapture(write, {
    mode: "extraction",
    supabase: ctx.supabase,
    ownerId: ctx.ownerId,
    sourceChatId: ctx.chatId,
    captureSource: ctx.captureSource,
  });

  if (result.table === "open_threads") {
    return { ok: true, open_thread_id: result.id };
  }

  return { ok: true, interaction_id: result.id, kind: result.kind };
}

export function bumpSummary(summary: ExtractionSummary, toolName: string): void {
  switch (toolName) {
    case "log_note": summary.notesLogged += 1; break;
    case "log_interaction": summary.interactionsLogged += 1; break;
    case "log_comms": summary.commsLogged += 1; break;
    case "open_commitment": summary.commitmentsOpened += 1; break;
  }
}

export function emptySummary(): ExtractionSummary {
  return {
    notesLogged: 0,
    interactionsLogged: 0,
    commsLogged: 0,
    commitmentsOpened: 0,
    toolErrors: [],
  };
}
