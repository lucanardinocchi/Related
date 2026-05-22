import type {
  ExtractionSummary,
  ResolvedRelationship,
  ToolContext,
} from "./types.ts";
import { resolveRelationship } from "./queries.ts";

function parseTime(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return fallback;
}

async function loadRelationshipOrThrow(
  ctx: ToolContext,
  relationshipId: string,
): Promise<ResolvedRelationship> {
  const rel = await resolveRelationship(ctx.supabase, relationshipId);
  if (!rel) throw new Error(`relationship not found: ${relationshipId}`);
  if (rel.targetType === "contact" && !rel.targetContactId) {
    throw new Error(`contact relationship ${relationshipId} has no contact`);
  }
  if (rel.targetType === "group" && !rel.targetGroupId) {
    throw new Error(`group relationship ${relationshipId} has no group`);
  }
  return rel;
}

async function createInteraction(
  ctx: ToolContext,
  rel: ResolvedRelationship,
  input: {
    time: string;
    kind: string;
    notes: string | null;
    status: string;
    category?: string;
  },
): Promise<string> {
  const contactIds =
    rel.targetType === "contact" && rel.targetContactId
      ? [rel.targetContactId]
      : [];
  const groupId = rel.targetType === "group" ? rel.targetGroupId : null;

  const { data, error } = await ctx.supabase.rpc("extraction_create_interaction", {
    p_owner_id: ctx.ownerId,
    p_source_chat_id: ctx.chatId,
    p_capture_source: ctx.captureSource,
    p_time: input.time,
    p_kind: input.kind,
    p_notes: input.notes,
    p_status: input.status,
    p_contact_ids: contactIds,
    p_group_id: groupId,
    p_category: input.category ?? "personal",
  });
  if (error) throw error;
  return data as string;
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "log_note": {
      const relationshipId = input.relationship_id as string;
      const content = input.content as string;
      if (!relationshipId || !content?.trim()) {
        throw new Error("relationship_id and content required");
      }
      const rel = await loadRelationshipOrThrow(ctx, relationshipId);
      const id = await createInteraction(ctx, rel, {
        time: parseTime(input.time, ctx.defaultTime),
        kind: "note",
        notes: content.trim(),
        status: "occurred",
        category: "personal",
      });
      return { ok: true, interaction_id: id, kind: "note" };
    }

    case "log_interaction": {
      const relationshipId = input.relationship_id as string;
      const kind = input.kind as string;
      const status = input.status as string;
      if (!relationshipId || !kind?.trim() || !status) {
        throw new Error("relationship_id, kind, and status required");
      }
      const rel = await loadRelationshipOrThrow(ctx, relationshipId);
      const id = await createInteraction(ctx, rel, {
        time: parseTime(input.time, ctx.defaultTime),
        kind: kind.trim(),
        notes: (input.notes as string | undefined)?.trim() || null,
        status,
        category: (input.category as string | undefined) ?? "personal",
      });
      return { ok: true, interaction_id: id, kind: kind.trim() };
    }

    case "log_comms": {
      const relationshipId = input.relationship_id as string;
      const channel = input.channel as string;
      if (!relationshipId || !channel) {
        throw new Error("relationship_id and channel required");
      }
      const rel = await loadRelationshipOrThrow(ctx, relationshipId);
      const id = await createInteraction(ctx, rel, {
        time: parseTime(input.time, ctx.defaultTime),
        kind: channel,
        notes: (input.notes as string | undefined)?.trim() || null,
        status: "occurred",
        category: "personal",
      });
      return { ok: true, interaction_id: id, kind: channel };
    }

    case "open_commitment": {
      const relationshipIds = input.relationship_ids as string[];
      const description = input.description as string;
      const direction = input.direction as string;
      if (
        !Array.isArray(relationshipIds) ||
        relationshipIds.length === 0 ||
        !description?.trim() ||
        !direction
      ) {
        throw new Error("relationship_ids, description, and direction required");
      }
      for (const relId of relationshipIds) {
        await loadRelationshipOrThrow(ctx, relId);
      }
      const origin =
        direction === "me_owes_them"
          ? ((input.origin as string | undefined) ?? "self_led")
          : null;
      const communicationStatus =
        (input.communication_status as string | undefined) ??
        "not_communicated";

      const { data, error } = await ctx.supabase.rpc(
        "extraction_create_open_thread",
        {
          p_owner_id: ctx.ownerId,
          p_source_chat_id: ctx.chatId,
          p_capture_source: ctx.captureSource,
          p_description: description.trim(),
          p_direction: direction,
          p_relationship_ids: relationshipIds,
          p_origin: origin,
          p_communication_status: communicationStatus,
        },
      );
      if (error) throw error;
      return { ok: true, open_thread_id: data as string };
    }

    default:
      throw new Error(`unknown extraction tool: ${name}`);
  }
}

export function bumpSummary(
  summary: ExtractionSummary,
  toolName: string,
): void {
  switch (toolName) {
    case "log_note":
      summary.notesLogged += 1;
      break;
    case "log_interaction":
      summary.interactionsLogged += 1;
      break;
    case "log_comms":
      summary.commsLogged += 1;
      break;
    case "open_commitment":
      summary.commitmentsOpened += 1;
      break;
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
