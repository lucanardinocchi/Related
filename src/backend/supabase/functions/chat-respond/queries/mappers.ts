// Raw PostgREST row shapes and row-to-domain mappers for snapshot preload.

import type {
  GroupSummary,
  InteractionSummary,
  OpenThreadSummary,
  RelationshipSummary,
  TransientIntentSummary,
} from "../types.ts";
import { MS_PER_DAY } from "../../_shared/conversational/snapshot.ts";

export interface RawRelationshipRow {
  id: string;
  target_type: "contact" | "group";
  role: string | null;
  cadence: string | null;
  contact: { name?: string | null } | null;
  group_target: { name?: string | null } | null;
}

export interface RawGroupRow {
  id: string;
  name: string;
  contact_groups?: { contact_id: string }[];
}

export interface RawOpenThreadRow {
  id: string;
  description: string | null;
  direction: "me_owes_them" | "they_owe_me";
  created_at: string;
  open_thread_relationships?: { relationship_id: string }[];
}

export interface RawInteractionRow {
  id: string;
  time: string;
  kind: string | null;
  status: string | null;
  interaction_contacts?: { contact_id: string }[];
}

export interface RawTransientIntentRow {
  content: string;
  captured_at: string;
  relationship_id: string | null;
}

export function mapRelationshipsToSummaries(
  rows: RawRelationshipRow[],
): RelationshipSummary[] {
  return rows.map((r) => ({
    id: r.id,
    target_type: r.target_type,
    role: r.role,
    cadence: r.cadence,
    name:
      r.target_type === "contact"
        ? r.contact?.name ?? "(unnamed contact)"
        : r.group_target?.name ?? "(unnamed group)",
  }));
}

export function mapGroupsToSummaries(rows: RawGroupRow[]): GroupSummary[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    member_count: r.contact_groups?.length ?? 0,
  }));
}

export function mapOpenThreadsToSummaries(
  rows: RawOpenThreadRow[],
  now: Date,
): OpenThreadSummary[] {
  return rows.map((r) => {
    const createdAt = new Date(r.created_at).getTime();
    const daysOutstanding = Math.max(
      0,
      Math.floor((now.getTime() - createdAt) / MS_PER_DAY),
    );
    return {
      id: r.id,
      description: r.description ?? "",
      direction: r.direction,
      days_outstanding: daysOutstanding,
      relationship_ids: extractOpenThreadRelationshipIds(r),
    };
  });
}

export function mapInteractionsToSummaries(
  rows: RawInteractionRow[],
): InteractionSummary[] {
  return rows.map((r) => ({
    id: r.id,
    time: r.time,
    kind: r.kind,
    status: r.status,
    contact_ids: (r.interaction_contacts ?? []).map((l) => l.contact_id),
  }));
}

export function mapTransientIntentToSummaries(
  rows: RawTransientIntentRow[],
): TransientIntentSummary[] {
  return rows.map((r) => ({
    content: r.content,
    captured_at: r.captured_at,
    relationship_id: r.relationship_id,
  }));
}

export function extractOpenThreadRelationshipIds(row: {
  open_thread_relationships?: { relationship_id: string }[];
}): string[] {
  return (row.open_thread_relationships ?? []).map((l) => l.relationship_id);
}

export function filterOpenThreadsByRelationship<
  T extends { open_thread_relationships?: { relationship_id: string }[] },
>(rows: T[], relationshipId: string): T[] {
  return rows.filter((r) =>
    extractOpenThreadRelationshipIds(r).includes(relationshipId),
  );
}

export function filterInteractionsByContact<
  T extends { interaction_contacts?: { contact_id: string }[] },
>(rows: T[], contactId: string): T[] {
  return rows.filter((r) =>
    (r.interaction_contacts ?? []).some((l) => l.contact_id === contactId),
  );
}
