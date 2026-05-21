// Loads a compact ConversationContextSnapshot for the User in one shot.
// Called once per chat-respond invocation. All queries use the
// User-scoped SupabaseClient; RLS enforces owner-only.
//
// Caps:
//   - relationships: 200
//   - groups: 50
//   - open_threads: 50 (open only)
//   - recent_interactions: 30-day window, 100 rows
//   - transient_intent: 20 rows (non-expired)
//
// When the underlying total exceeds a cap, the snapshot includes a
// `*Total` count so the prompt can hint the model to call the
// corresponding tool for the remainder.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import type {
  ConversationContextSnapshot,
  GroupSummary,
  InteractionSummary,
  OpenThreadSummary,
  RelationshipSummary,
  TransientIntentSummary,
} from "./types.ts";

const RELATIONSHIPS_CAP = 200;
const GROUPS_CAP = 50;
const OPEN_THREADS_CAP = 50;
const INTERACTIONS_CAP = 100;
const INTERACTIONS_WINDOW_DAYS = 30;
const TRANSIENT_INTENT_CAP = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface RawRelationshipRow {
  id: string;
  target_type: "contact" | "group";
  role: string | null;
  cadence: string | null;
  contact: { name?: string | null } | null;
  group_target: { name?: string | null } | null;
}

interface RawGroupRow {
  id: string;
  name: string;
  contact_groups?: { contact_id: string }[];
}

interface RawOpenThreadRow {
  id: string;
  description: string | null;
  direction: "me_owes_them" | "they_owe_me";
  created_at: string;
  open_thread_relationships?: { relationship_id: string }[];
}

interface RawInteractionRow {
  id: string;
  time: string;
  kind: string | null;
  status: string | null;
  interaction_contacts?: { contact_id: string }[];
}

export async function loadConversationContext(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<ConversationContextSnapshot> {
  const sinceIso = new Date(
    now.getTime() - INTERACTIONS_WINDOW_DAYS * MS_PER_DAY,
  ).toISOString();
  const nowIso = now.toISOString();

  const [
    relationshipsRes,
    groupsRes,
    openThreadsRes,
    interactionsRes,
    goalsRes,
    situationalRes,
    transientRes,
  ] = await Promise.all([
    supabase
      .from("relationships")
      .select(
        "id, target_type, role, cadence, contact:contacts!target_contact_id(name), group_target:groups!target_group_id(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .limit(RELATIONSHIPS_CAP),
    supabase
      .from("groups")
      .select("id, name, contact_groups(contact_id)")
      .order("name", { ascending: true })
      .limit(GROUPS_CAP),
    supabase
      .from("open_threads")
      .select(
        "id, description, direction, created_at, open_thread_relationships(relationship_id)",
        { count: "exact" },
      )
      .is("closed_at", null)
      .order("created_at", { ascending: false })
      .limit(OPEN_THREADS_CAP),
    supabase
      .from("interactions")
      .select(
        "id, time, kind, status, interaction_contacts(contact_id)",
        { count: "exact" },
      )
      .gte("time", sinceIso)
      .order("time", { ascending: false })
      .limit(INTERACTIONS_CAP),
    supabase
      .from("goals_and_values")
      .select("content")
      .order("created_at", { ascending: true }),
    supabase
      .from("situational_state")
      .select("content")
      .maybeSingle(),
    supabase
      .from("transient_intent")
      .select("content, captured_at, relationship_id")
      .gt("expires_at", nowIso)
      .order("captured_at", { ascending: false })
      .limit(TRANSIENT_INTENT_CAP),
  ]);

  const relationships = mapRelationships(
    (relationshipsRes.data ?? []) as RawRelationshipRow[],
  );
  const groups = mapGroups((groupsRes.data ?? []) as RawGroupRow[]);
  const openThreads = mapOpenThreads(
    (openThreadsRes.data ?? []) as RawOpenThreadRow[],
    now,
  );
  const recentInteractions = mapInteractions(
    (interactionsRes.data ?? []) as RawInteractionRow[],
  );
  const transientIntent = mapTransientIntent(
    (transientRes.data ?? []) as Array<{
      content: string;
      captured_at: string;
      relationship_id: string | null;
    }>,
  );

  return {
    asOf: nowIso,
    relationships,
    relationshipsTotal: relationshipsRes.count ?? relationships.length,
    groups,
    userContext: {
      goalsAndValues: ((goalsRes.data ?? []) as Array<{ content: string }>).map(
        (r) => r.content,
      ),
      situationalState:
        (situationalRes.data as { content?: string } | null)?.content ?? null,
      recentTransientIntent: transientIntent,
    },
    openThreads,
    openThreadsTotal: openThreadsRes.count ?? openThreads.length,
    recentInteractions,
    recentInteractionsTotal: interactionsRes.count ?? recentInteractions.length,
  };
}

function mapRelationships(rows: RawRelationshipRow[]): RelationshipSummary[] {
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

function mapGroups(rows: RawGroupRow[]): GroupSummary[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    member_count: r.contact_groups?.length ?? 0,
  }));
}

function mapOpenThreads(
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
      relationship_ids: (r.open_thread_relationships ?? []).map(
        (l) => l.relationship_id,
      ),
    };
  });
}

function mapInteractions(rows: RawInteractionRow[]): InteractionSummary[] {
  return rows.map((r) => ({
    id: r.id,
    time: r.time,
    kind: r.kind,
    status: r.status,
    contact_ids: (r.interaction_contacts ?? []).map((l) => l.contact_id),
  }));
}

function mapTransientIntent(
  rows: Array<{
    content: string;
    captured_at: string;
    relationship_id: string | null;
  }>,
): TransientIntentSummary[] {
  return rows.map((r) => ({
    content: r.content,
    captured_at: r.captured_at,
    relationship_id: r.relationship_id,
  }));
}
