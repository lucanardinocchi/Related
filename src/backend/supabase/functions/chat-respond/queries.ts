// Centralized read queries for chat-respond. Select strings, filters,
// and row-to-domain mappers live here so contextLoader and tools share
// one join shape per entity. Deno-compatible — no @related/shared imports.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import type {
  GroupSummary,
  InteractionSummary,
  OpenThreadSummary,
  RelationshipSummary,
  TransientIntentSummary,
} from "./types.ts";

// --- Select strings (single source of truth for join shapes) ---

export const RELATIONSHIP_SELECT_SNAPSHOT =
  "id, target_type, role, cadence, contact:contacts!target_contact_id(name), group_target:groups!target_group_id(name)";

export const RELATIONSHIP_SELECT_TOOL =
  "id, target_type, role, cadence, created_at, contact:contacts!target_contact_id(id, name, phone, email, birthday, area, occupation, education), group_target:groups!target_group_id(id, name)";

export const GROUP_SELECT_SNAPSHOT = "id, name, contact_groups(contact_id)";
export const GROUP_SELECT_LIST = "id, name, created_at";
export const GROUP_SELECT_DETAIL =
  "id, name, created_at, contact_groups(contact_id, contacts(id, name))";

export const OPEN_THREAD_SELECT_SNAPSHOT =
  "id, description, direction, created_at, open_thread_relationships(relationship_id)";
export const OPEN_THREAD_SELECT_TOOL =
  "id, description, direction, origin, communication_status, created_at, closed_at, open_thread_relationships(relationship_id)";

export const INTERACTION_SELECT_SNAPSHOT =
  "id, time, kind, status, interaction_contacts(contact_id)";
export const INTERACTION_SELECT_TOOL =
  "id, time, kind, notes, status, interaction_contacts(contact_id, contacts(name))";

export const GOALS_SELECT_SNAPSHOT = "content";
export const GOALS_SELECT_TOOL = "id, content, created_at, updated_at";
export const SITUATIONAL_SELECT_SNAPSHOT = "content";
export const SITUATIONAL_SELECT_TOOL = "id, content, updated_at";
export const TRANSIENT_SELECT_SNAPSHOT =
  "content, captured_at, relationship_id";
export const TRANSIENT_SELECT_TOOL =
  "id, content, captured_at, expires_at, relationship_id";

// --- Snapshot caps (context preload) ---

export const SNAPSHOT_CAPS = {
  relationships: 200,
  groups: 50,
  openThreads: 50,
  interactions: 100,
  interactionsWindowDays: 30,
  transientIntent: 20,
} as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Raw row shapes ---

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

// --- Row-to-domain mappers ---

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

// --- Snapshot fetchers (context preload) ---

export function fetchRelationshipsSnapshot(
  supabase: SupabaseClient,
  cap = SNAPSHOT_CAPS.relationships,
) {
  return supabase
    .from("relationships")
    .select(RELATIONSHIP_SELECT_SNAPSHOT, { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(cap);
}

export function fetchGroupsSnapshot(
  supabase: SupabaseClient,
  cap = SNAPSHOT_CAPS.groups,
) {
  return supabase
    .from("groups")
    .select(GROUP_SELECT_SNAPSHOT)
    .order("name", { ascending: true })
    .limit(cap);
}

export function fetchOpenThreadsSnapshot(
  supabase: SupabaseClient,
  cap = SNAPSHOT_CAPS.openThreads,
) {
  return supabase
    .from("open_threads")
    .select(OPEN_THREAD_SELECT_SNAPSHOT, { count: "exact" })
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(cap);
}

export function fetchInteractionsSnapshot(
  supabase: SupabaseClient,
  sinceIso: string,
  cap = SNAPSHOT_CAPS.interactions,
) {
  return supabase
    .from("interactions")
    .select(INTERACTION_SELECT_SNAPSHOT, { count: "exact" })
    .gte("time", sinceIso)
    .order("time", { ascending: false })
    .limit(cap);
}

export function fetchGoalsSnapshot(supabase: SupabaseClient) {
  return supabase
    .from("goals_and_values")
    .select(GOALS_SELECT_SNAPSHOT)
    .order("created_at", { ascending: true });
}

export function fetchSituationalStateSnapshot(supabase: SupabaseClient) {
  return supabase
    .from("situational_state")
    .select(SITUATIONAL_SELECT_SNAPSHOT)
    .maybeSingle();
}

export function fetchTransientIntentSnapshot(
  supabase: SupabaseClient,
  nowIso: string,
  cap = SNAPSHOT_CAPS.transientIntent,
) {
  return supabase
    .from("transient_intent")
    .select(TRANSIENT_SELECT_SNAPSHOT)
    .gt("expires_at", nowIso)
    .order("captured_at", { ascending: false })
    .limit(cap);
}

// --- Tool query builders ---

export function buildRelationshipsListQuery(
  supabase: SupabaseClient,
  targetType?: string,
) {
  let q = supabase
    .from("relationships")
    .select(RELATIONSHIP_SELECT_TOOL)
    .order("created_at", { ascending: false });
  if (targetType && targetType !== "all") {
    q = q.eq("target_type", targetType);
  }
  return q;
}

export function buildRelationshipByIdQuery(
  supabase: SupabaseClient,
  relationshipId: string,
) {
  return supabase
    .from("relationships")
    .select(RELATIONSHIP_SELECT_TOOL)
    .eq("id", relationshipId)
    .single();
}

export function buildOpenThreadsListQuery(
  supabase: SupabaseClient,
  options: {
    includeClosed?: boolean;
    direction?: string;
  } = {},
) {
  let q = supabase
    .from("open_threads")
    .select(OPEN_THREAD_SELECT_TOOL)
    .order("created_at", { ascending: false });
  if (!options.includeClosed) q = q.is("closed_at", null);
  if (options.direction) q = q.eq("direction", options.direction);
  return q;
}

export function buildInteractionsListQuery(
  supabase: SupabaseClient,
  options: {
    status?: string;
    since?: string;
    until?: string;
    limit?: number;
  } = {},
) {
  let q = supabase
    .from("interactions")
    .select(INTERACTION_SELECT_TOOL)
    .order("time", { ascending: false })
    .limit(options.limit ?? 200);
  if (options.status) q = q.eq("status", options.status);
  if (options.since) q = q.gte("time", options.since);
  if (options.until) q = q.lte("time", options.until);
  return q;
}

export function buildGroupsListQuery(supabase: SupabaseClient) {
  return supabase
    .from("groups")
    .select(GROUP_SELECT_LIST)
    .order("name", { ascending: true });
}

export function buildGroupByIdQuery(supabase: SupabaseClient, groupId: string) {
  return supabase
    .from("groups")
    .select(GROUP_SELECT_DETAIL)
    .eq("id", groupId)
    .single();
}

export async function fetchUserContextForTool(supabase: SupabaseClient) {
  const nowIso = new Date().toISOString();
  const [goals, ss, ti] = await Promise.all([
    supabase
      .from("goals_and_values")
      .select(GOALS_SELECT_TOOL)
      .order("created_at", { ascending: false }),
    supabase
      .from("situational_state")
      .select(SITUATIONAL_SELECT_TOOL)
      .maybeSingle(),
    supabase
      .from("transient_intent")
      .select(TRANSIENT_SELECT_TOOL)
      .gt("expires_at", nowIso)
      .order("captured_at", { ascending: false })
      .limit(20),
  ]);
  if (goals.error) throw goals.error;
  if (ss.error) throw ss.error;
  if (ti.error) throw ti.error;
  return {
    goals_and_values: goals.data ?? [],
    situational_state: ss.data ?? null,
    transient_intent: ti.data ?? [],
  };
}
