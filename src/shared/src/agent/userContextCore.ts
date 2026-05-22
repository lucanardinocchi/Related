import type { SupabaseClient } from "@supabase/supabase-js";
import {
  summariseCalendarDensity,
  type CalendarDensitySignal,
  type RawCalendarEvent,
} from "../signals/calendarDensity.ts";
import {
  summariseSleep,
  type SleepSignal,
  type RawSleepRecord,
} from "../signals/sleepSummary.ts";

export type { CalendarDensitySignal, RawCalendarEvent, SleepSignal, RawSleepRecord };

/**
 * Canonical User Context assembly for Ambient Pass and Conversational turns.
 *
 * ## Field parity (intentional differences)
 *
 * | Field | Ambient Pass | Conversational |
 * |-------|--------------|----------------|
 * | goalsAndValues | full GoalEntry[] | content strings only |
 * | situationalState | full snapshot | content string only |
 * | transientIntent | session-scoped strings (engaged only) | capped rows w/ captured_at + relationship_id |
 * | groups order | created_at desc | name asc |
 * | groups shape | memberCount + createdAt | member_count only |
 * | relationships | otherRelationships (excludes focal) | all relationships + total count |
 * | operatorStrengths | yes | no |
 * | inferredSignals | yes | no |
 * | characterValuesAlignment | yes | no |
 * | openThreads / interactions | no (relationship-scoped elsewhere) | yes (contextLoader) |
 *
 * Caps aligned: relationships 200, groups 50, transientIntent 20 (conversational only).
 * Pass engaged transient intent is session-filtered with no row cap.
 */

export const USER_CONTEXT_CAPS = {
  relationships: 200,
  groups: 50,
  transientIntent: 20,
} as const;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Domain types (camelCase — shared convention) ---

export interface GoalEntry {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SituationalStateSnapshot {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransientIntentEntry {
  content: string;
  capturedAt: string;
  relationshipId: string | null;
}

export interface UserContextGroupSummary {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

export interface UserContextRelationshipSummary {
  id: string;
  targetType: "contact" | "group";
  name: string;
  role: string | null;
  cadence: string | null;
}

export interface OperatorStrengthEntry {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterValuesAlignmentEntry {
  id: string;
  characterId: string;
  aligned: boolean;
  rankPosition: number | null;
  characterName: string | null;
  characterSource: string | null;
  characterValues: string[] | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * User Context slice for Ambient Intelligence passes — Goals & Values,
 * Situational State, and Operator Strengths only. Relationship-local data
 * (comms, events, history) lives in RelationshipContextSnapshot.
 */
export interface AmbientUserContextSnapshot {
  userId: string;
  asOf: string;
  transientIntent: string[];
  goalsAndValues: GoalEntry[];
  situationalState: SituationalStateSnapshot | null;
  operatorStrengths: OperatorStrengthEntry[];
  inferredSignals: InferredSignalsSnapshot;
  groups: UserContextGroupSummary[];
  otherRelationships: UserContextRelationshipSummary[];
  characterValuesAlignment: CharacterValuesAlignmentEntry[];
}

export type UserContextSnapshot = AmbientUserContextSnapshot;

export interface InferredSignalsSnapshot {
  calendarDensity: CalendarDensitySignal | null;
  sleep: SleepSignal | null;
  calendarEvents: RawCalendarEvent[];
  sleepRecords: RawSleepRecord[];
}

export interface AmbientPassExtrasSnapshot {
  operatorStrengths: OperatorStrengthEntry[];
  inferredSignals: InferredSignalsSnapshot;
  characterValuesAlignment: CharacterValuesAlignmentEntry[];
}

/** Loaded once from Supabase; projected per consumer via forAmbientPass / forConversationalTurn. */
export interface UserContextCoreSnapshot {
  asOf: string;
  goalsAndValues: GoalEntry[];
  situationalState: SituationalStateSnapshot | null;
  transientIntent: TransientIntentEntry[];
  groups: UserContextGroupSummary[];
  relationships: UserContextRelationshipSummary[];
  relationshipsTotal: number;
}

export type TransientIntentLoadMode =
  | { kind: "none" }
  | { kind: "all_non_expired"; cap?: number }
  | { kind: "session"; sessionId: string };

export interface LoadUserContextCoreOptions {
  asOf: Date;
  transientIntent?: TransientIntentLoadMode;
  /** Exclude one relationship (Ambient Pass focal relationship). */
  excludeRelationshipId?: string;
  /** Conversational sorts groups by name; Ambient Pass by newest first. */
  groupsOrder?: "name_asc" | "created_at_desc";
}

// --- PostgREST select strings ---

export const GOALS_SELECT =
  "id, content, created_at, updated_at";
export const SITUATIONAL_SELECT =
  "id, content, created_at, updated_at";
export const TRANSIENT_SELECT_CONVERSATIONAL =
  "content, captured_at, relationship_id";
export const TRANSIENT_SELECT_SESSION = "content";
export const RELATIONSHIP_SELECT =
  "id, target_type, role, cadence, contact:contacts!target_contact_id(name), group_target:groups!target_group_id(name)";
export const GROUP_SELECT =
  "id, name, created_at, contact_groups(contact_id)";
export const OPERATOR_STRENGTHS_SELECT = "id, content, created_at, updated_at";
export const CALENDAR_SIGNAL_SELECT = "event_id, title, start, end, is_all_day";
export const SLEEP_SIGNAL_SELECT = "record_id, started_at, ended_at, duration_minutes, quality";
export const CHARACTER_ALIGNMENT_SELECT = "id, character_id, aligned, rank_position, character_name, character_source, character_values, created_at, updated_at";
const CALENDAR_SIGNAL_WINDOW_DAYS = 7;
const SLEEP_SIGNAL_WINDOW_DAYS = 3;

// --- Raw row shapes ---

interface GoalRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface SituationalStateRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  contact_groups?: { contact_id: string }[];
}

interface RawTransientConversationalRow {
  content: string;
  captured_at: string;
  relationship_id: string | null;
}

interface RawTransientSessionRow { content: string; }
interface OperatorStrengthRow { id: string; content: string; created_at: string; updated_at: string; }
interface RawCalendarSignalRow { event_id: string; title: string | null; start: string; end: string; is_all_day: boolean; }
interface RawSleepSignalRow { record_id: string; started_at: string; ended_at: string; duration_minutes: number; quality: string | null; }
interface CharacterValuesAlignmentRow { id: string; character_id: string; aligned: boolean; rank_position: number | null; character_name: string | null; character_source: string | null; character_values: string[] | null; created_at: string; updated_at: string; }

// --- Mappers ---

export function mapGoalRows(rows: GoalRow[]): GoalEntry[] {
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function mapSituationalRow(
  row: SituationalStateRow | null,
): SituationalStateSnapshot | null {
  if (!row) return null;
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRelationshipRows(
  rows: RawRelationshipRow[],
): UserContextRelationshipSummary[] {
  return rows.map((r) => ({
    id: r.id,
    targetType: r.target_type,
    name:
      r.target_type === "contact"
        ? r.contact?.name ?? "(unnamed contact)"
        : r.group_target?.name ?? "(unnamed group)",
    role: r.role,
    cadence: r.cadence,
  }));
}

export function mapGroupRows(rows: RawGroupRow[]): UserContextGroupSummary[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    memberCount: r.contact_groups?.length ?? 0,
    createdAt: r.created_at,
  }));
}

export function mapTransientConversationalRows(
  rows: RawTransientConversationalRow[],
): TransientIntentEntry[] {
  return rows.map((r) => ({
    content: r.content,
    capturedAt: r.captured_at,
    relationshipId: r.relationship_id,
  }));
}


export function mapOperatorStrengthRows(rows: OperatorStrengthRow[]): OperatorStrengthEntry[] {
  return rows.map((r) => ({ id: r.id, content: r.content, createdAt: r.created_at, updatedAt: r.updated_at }));
}
export function mapCalendarSignalRows(rows: RawCalendarSignalRow[]): RawCalendarEvent[] {
  return rows.map((r) => ({ id: r.event_id, title: r.title ?? undefined, start: r.start, end: r.end, isAllDay: r.is_all_day }));
}
export function mapSleepSignalRows(rows: RawSleepSignalRow[]): RawSleepRecord[] {
  return rows.map((r) => ({ id: r.record_id, startedAt: r.started_at, endedAt: r.ended_at, durationMinutes: r.duration_minutes, quality: r.quality }));
}
export function mapCharacterValuesAlignmentRows(rows: CharacterValuesAlignmentRow[]): CharacterValuesAlignmentEntry[] {
  return rows.map((r) => ({ id: r.id, characterId: r.character_id, aligned: r.aligned, rankPosition: r.rank_position, characterName: r.character_name, characterSource: r.character_source, characterValues: r.character_values, createdAt: r.created_at, updatedAt: r.updated_at }));
}

// --- Fetch helpers (usable from Node and Deno) ---

export async function fetchGoals(supabase: SupabaseClient) {
  return supabase
    .from("goals_and_values")
    .select(GOALS_SELECT)
    .order("created_at", { ascending: true });
}

export async function fetchSituationalState(supabase: SupabaseClient) {
  return supabase.from("situational_state").select(SITUATIONAL_SELECT).maybeSingle();
}

export async function fetchTransientIntent(
  supabase: SupabaseClient,
  asOf: Date,
  mode: TransientIntentLoadMode,
) {
  if (mode.kind === "none") {
    return { data: [] as RawTransientConversationalRow[], error: null };
  }
  if (mode.kind === "session") {
    return supabase
      .from("transient_intent")
      .select(TRANSIENT_SELECT_SESSION)
      .eq("session_id", mode.sessionId)
      .gt("expires_at", asOf.toISOString());
  }
  const cap = mode.cap ?? USER_CONTEXT_CAPS.transientIntent;
  return supabase
    .from("transient_intent")
    .select(TRANSIENT_SELECT_CONVERSATIONAL)
    .gt("expires_at", asOf.toISOString())
    .order("captured_at", { ascending: false })
    .limit(cap);
}

export async function fetchRelationships(
  supabase: SupabaseClient,
  options: { excludeRelationshipId?: string; cap?: number } = {},
) {
  const cap = options.cap ?? USER_CONTEXT_CAPS.relationships;
  let query = supabase
    .from("relationships")
    .select(RELATIONSHIP_SELECT, { count: "exact" });
  if (options.excludeRelationshipId) {
    query = query.neq("id", options.excludeRelationshipId);
  }
  return query.order("created_at", { ascending: false }).limit(cap);
}

export async function fetchGroups(
  supabase: SupabaseClient,
  order: "name_asc" | "created_at_desc",
  cap = USER_CONTEXT_CAPS.groups,
) {
  let q = supabase.from("groups").select(GROUP_SELECT);
  if (order === "name_asc") {
    q = q.order("name", { ascending: true });
  } else {
    q = q.order("created_at", { ascending: false });
  }
  return q.limit(cap);
}

export async function fetchOperatorStrengths(supabase: SupabaseClient) {
  return supabase.from("operator_strengths").select(OPERATOR_STRENGTHS_SELECT).order("created_at", { ascending: true });
}
export async function fetchInferredSignalCalendar(supabase: SupabaseClient, asOf: Date) {
  const windowEnd = new Date(asOf); windowEnd.setUTCDate(windowEnd.getUTCDate() + CALENDAR_SIGNAL_WINDOW_DAYS);
  return supabase.from("inferred_signal_calendar").select(CALENDAR_SIGNAL_SELECT).gte("start", asOf.toISOString()).lte("start", windowEnd.toISOString()).order("start", { ascending: true });
}
export async function fetchInferredSignalSleep(supabase: SupabaseClient, asOf: Date) {
  const windowStart = new Date(asOf); windowStart.setUTCDate(windowStart.getUTCDate() - SLEEP_SIGNAL_WINDOW_DAYS);
  return supabase.from("inferred_signal_sleep").select(SLEEP_SIGNAL_SELECT).gte("started_at", windowStart.toISOString()).lte("started_at", asOf.toISOString()).order("started_at", { ascending: false });
}
export async function fetchCharacterValuesAlignment(supabase: SupabaseClient) {
  return supabase.from("user_character_values_alignment").select(CHARACTER_ALIGNMENT_SELECT).order("updated_at", { ascending: false });
}
export async function loadAmbientPassExtras(supabase: SupabaseClient, asOf: Date): Promise<AmbientPassExtrasSnapshot> {
  const [operatorRes, calendarRes, sleepRes, alignmentRes] = await Promise.all([
    fetchOperatorStrengths(supabase), fetchInferredSignalCalendar(supabase, asOf),
    fetchInferredSignalSleep(supabase, asOf), fetchCharacterValuesAlignment(supabase),
  ]);
  if (operatorRes.error) throw operatorRes.error;
  if (calendarRes.error) throw calendarRes.error;
  if (sleepRes.error) throw sleepRes.error;
  if (alignmentRes.error) throw alignmentRes.error;
  const calendarEvents = mapCalendarSignalRows((calendarRes.data ?? []) as RawCalendarSignalRow[]);
  const sleepRecords = mapSleepSignalRows((sleepRes.data ?? []) as RawSleepSignalRow[]);
  return {
    operatorStrengths: mapOperatorStrengthRows((operatorRes.data ?? []) as OperatorStrengthRow[]),
    inferredSignals: {
      calendarEvents, sleepRecords,
      calendarDensity: calendarEvents.length ? summariseCalendarDensity(calendarEvents, asOf) : null,
      sleep: sleepRecords.length ? summariseSleep(sleepRecords, asOf) : null,
    },
    characterValuesAlignment: mapCharacterValuesAlignmentRows((alignmentRes.data ?? []) as CharacterValuesAlignmentRow[]),
  };
}

/** Single parallel load of overlapping User Context tables. */
export async function loadUserContextCore(
  supabase: SupabaseClient,
  options: LoadUserContextCoreOptions,
): Promise<UserContextCoreSnapshot> {
  const asOfIso = options.asOf.toISOString();
  const transientMode = options.transientIntent ?? { kind: "none" as const };
  const groupsOrder = options.groupsOrder ?? "created_at_desc";

  const [goalsRes, situationalRes, transientRes, groupsRes, relationshipsRes] =
    await Promise.all([
      fetchGoals(supabase),
      fetchSituationalState(supabase),
      fetchTransientIntent(supabase, options.asOf, transientMode),
      fetchGroups(supabase, groupsOrder),
      fetchRelationships(supabase, {
        excludeRelationshipId: options.excludeRelationshipId,
      }),
    ]);

  if (goalsRes.error) throw goalsRes.error;
  if (situationalRes.error) throw situationalRes.error;
  if (transientRes.error) throw transientRes.error;
  if (groupsRes.error) throw groupsRes.error;
  if (relationshipsRes.error) throw relationshipsRes.error;

  const relationships = mapRelationshipRows(
    (relationshipsRes.data ?? []) as RawRelationshipRow[],
  );

  let transientIntent: TransientIntentEntry[];
  if (transientMode.kind === "session") {
    transientIntent = ((transientRes.data ?? []) as RawTransientSessionRow[]).map(
      (r) => ({
        content: r.content,
        capturedAt: asOfIso,
        relationshipId: null,
      }),
    );
  } else {
    transientIntent = mapTransientConversationalRows(
      (transientRes.data ?? []) as RawTransientConversationalRow[],
    );
  }

  return {
    asOf: asOfIso,
    goalsAndValues: mapGoalRows((goalsRes.data ?? []) as GoalRow[]),
    situationalState: mapSituationalRow(
      (situationalRes.data as SituationalStateRow | null) ?? null,
    ),
    transientIntent,
    groups: mapGroupRows((groupsRes.data ?? []) as RawGroupRow[]),
    relationships,
    relationshipsTotal: relationshipsRes.count ?? relationships.length,
  };
}
