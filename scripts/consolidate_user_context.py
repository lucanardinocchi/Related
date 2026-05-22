#!/usr/bin/env python3
"""Consolidate User Context assembly — single loader + named projections."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PROJECTIONS = r'''import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadAmbientPassExtras,
  loadUserContextCore,
  type AmbientPassExtrasSnapshot,
  type AmbientUserContextSnapshot,
  type LoadUserContextCoreOptions,
  type TransientIntentEntry,
  type TransientIntentLoadMode,
  type UserContextCoreSnapshot,
  type UserContextGroupSummary,
  type UserContextRelationshipSummary,
} from "./userContextCore.ts";

export const AMBIENT_PASS_USER_CONTEXT_FLAVOURS = [
  "transientIntent", "situationalState", "goalsAndValues", "operatorStrengths", "inferredSignals",
] as const;
export const CONVERSATIONAL_USER_CONTEXT_FLAVOURS = [
  "goalsAndValues", "situationalState", "recentTransientIntent",
] as const;

export interface ConversationalUserContextSlice {
  goalsAndValues: string[];
  situationalState: string | null;
  recentTransientIntent: ConversationalTransientIntentSummary[];
}
export interface ConversationalTransientIntentSummary {
  content: string; captured_at: string; relationship_id: string | null;
}
export interface ConversationalRelationshipSummary {
  id: string; target_type: "contact" | "group"; role: string | null; cadence: string | null; name: string;
}
export interface ConversationalGroupSummary { id: string; name: string; member_count: number; }
export interface ConversationalUserContextBundle {
  userContext: ConversationalUserContextSlice;
  relationships: ConversationalRelationshipSummary[];
  relationshipsTotal: number;
  groups: ConversationalGroupSummary[];
}
export interface AmbientPassExtras extends AmbientPassExtrasSnapshot { userId: string; }
export interface AssembleAmbientUserContextOptions {
  userId: string; asOf: Date; excludeRelationshipId?: string; transientIntent?: TransientIntentLoadMode;
}

function mapTransientToConversational(rows: TransientIntentEntry[]) {
  return rows.map((r) => ({ content: r.content, captured_at: r.capturedAt, relationship_id: r.relationshipId }));
}
function mapRelationshipToConversational(r: UserContextRelationshipSummary): ConversationalRelationshipSummary {
  return { id: r.id, target_type: r.targetType, role: r.role, cadence: r.cadence, name: r.name };
}
function mapGroupToConversational(g: UserContextGroupSummary): ConversationalGroupSummary {
  return { id: g.id, name: g.name, member_count: g.memberCount };
}

export function projectForAmbientPass(core: UserContextCoreSnapshot, extras: AmbientPassExtras): AmbientUserContextSnapshot {
  return {
    userId: extras.userId, asOf: core.asOf,
    transientIntent: core.transientIntent.map((t) => t.content),
    goalsAndValues: core.goalsAndValues, situationalState: core.situationalState,
    operatorStrengths: extras.operatorStrengths, inferredSignals: extras.inferredSignals,
    groups: core.groups, otherRelationships: core.relationships,
    characterValuesAlignment: extras.characterValuesAlignment,
  };
}
export function projectForEngagedPass(core: UserContextCoreSnapshot, extras: AmbientPassExtras): AmbientUserContextSnapshot {
  return projectForAmbientPass(core, extras);
}
export function projectForConversationalTurn(core: UserContextCoreSnapshot): ConversationalUserContextBundle {
  return {
    userContext: {
      goalsAndValues: core.goalsAndValues.map((g) => g.content),
      situationalState: core.situationalState?.content ?? null,
      recentTransientIntent: mapTransientToConversational(core.transientIntent),
    },
    relationships: core.relationships.map(mapRelationshipToConversational),
    relationshipsTotal: core.relationshipsTotal,
    groups: core.groups.map(mapGroupToConversational),
  };
}
export async function assembleUserContextForAmbientPass(
  supabase: SupabaseClient,
  options: AssembleAmbientUserContextOptions,
): Promise<AmbientUserContextSnapshot> {
  const transientIntent = options.transientIntent ?? { kind: "none" as const };
  const [core, extras] = await Promise.all([
    loadUserContextCore(supabase, {
      asOf: options.asOf, transientIntent,
      excludeRelationshipId: options.excludeRelationshipId,
      groupsOrder: "created_at_desc",
    } satisfies LoadUserContextCoreOptions),
    loadAmbientPassExtras(supabase, options.asOf),
  ]);
  return projectForAmbientPass(core, { userId: options.userId, ...extras });
}
'''

TESTS = r'''import {
  AMBIENT_PASS_USER_CONTEXT_FLAVOURS,
  CONVERSATIONAL_USER_CONTEXT_FLAVOURS,
  projectForAmbientPass,
  projectForConversationalTurn,
} from "./userContextProjections";

describe("userContextProjections", () => {
  const core = {
    asOf: "2026-05-19T00:00:00.000Z",
    goalsAndValues: [{ id: "g-1", content: "Be present", createdAt: "", updatedAt: "" }],
    situationalState: { id: "ss-1", content: "New city", createdAt: "", updatedAt: "" },
    transientIntent: [{ content: "Plan birthday", capturedAt: "2026-05-18T00:00:00Z", relationshipId: "r-2" }],
    groups: [{ id: "grp-1", name: "College", memberCount: 3, createdAt: "" }],
    relationships: [{ id: "r-2", targetType: "contact" as const, name: "Sam", role: null, cadence: null }],
    relationshipsTotal: 1,
  };
  const ambientExtras = {
    userId: "u-1",
    operatorStrengths: [{ id: "os-1", content: "coaching", createdAt: "", updatedAt: "" }],
    inferredSignals: { calendarDensity: null, sleep: null, calendarEvents: [], sleepRecords: [] },
    characterValuesAlignment: [],
  };

  it("projectForConversationalTurn exposes documented flavours", () => {
    expect(Object.keys(projectForConversationalTurn(core).userContext).sort()).toEqual(
      [...CONVERSATIONAL_USER_CONTEXT_FLAVOURS].sort(),
    );
  });

  it("projectForAmbientPass includes all five flavours", () => {
    const snapshot = projectForAmbientPass(core, ambientExtras);
    for (const flavour of AMBIENT_PASS_USER_CONTEXT_FLAVOURS) expect(snapshot).toHaveProperty(flavour);
    expect(snapshot.transientIntent).toEqual(["Plan birthday"]);
    expect(snapshot.inferredSignals).toEqual(ambientExtras.inferredSignals);
  });
});
'''


def patch_core() -> None:
    cp = ROOT / "src/shared/src/agent/userContextCore.ts"
    t = cp.read_text()
    if "loadAmbientPassExtras" in t:
        return

    t = t.replace(
        'import type { SupabaseClient } from "@supabase/supabase-js";\n'
        'import type { CalendarDensitySignal } from "../signals/calendarDensity";\n'
        'import type { RawCalendarEvent } from "../signals/calendarDensity";\n'
        'import type { SleepSignal } from "../signals/sleepSummary";\n'
        'import type { RawSleepRecord } from "../signals/sleepSummary";',
        'import type { SupabaseClient } from "@supabase/supabase-js";\n'
        'import {\n  summariseCalendarDensity,\n  type CalendarDensitySignal,\n  type RawCalendarEvent,\n'
        '} from "../signals/calendarDensity";\n'
        'import {\n  summariseSleep,\n  type SleepSignal,\n  type RawSleepRecord,\n'
        '} from "../signals/sleepSummary";',
    )

    t = t.replace(
        'export interface AmbientUserContextSnapshot {\n'
        '  userId: string;\n'
        '  asOf: string;\n'
        '  goalsAndValues: GoalEntry[];\n'
        '  situationalState: SituationalStateSnapshot | null;\n'
        '  operatorStrengths: OperatorStrengthEntry[];\n'
        '}\n\n'
        '/** @deprecated Alias — use AmbientUserContextSnapshot */\n'
        'export type UserContextSnapshot = AmbientUserContextSnapshot;',
        'export interface AmbientUserContextSnapshot {\n'
        '  userId: string;\n  asOf: string;\n  transientIntent: string[];\n'
        '  goalsAndValues: GoalEntry[];\n'
        '  situationalState: SituationalStateSnapshot | null;\n'
        '  operatorStrengths: OperatorStrengthEntry[];\n'
        '  inferredSignals: InferredSignalsSnapshot;\n'
        '  groups: UserContextGroupSummary[];\n'
        '  otherRelationships: UserContextRelationshipSummary[];\n'
        '  characterValuesAlignment: CharacterValuesAlignmentEntry[];\n'
        '}\n\nexport type UserContextSnapshot = AmbientUserContextSnapshot;\n\n'
        'export interface InferredSignalsSnapshot {\n'
        '  calendarDensity: CalendarDensitySignal | null;\n'
        '  sleep: SleepSignal | null;\n'
        '  calendarEvents: RawCalendarEvent[];\n'
        '  sleepRecords: RawSleepRecord[];\n'
        '}\n\nexport interface AmbientPassExtrasSnapshot {\n'
        '  operatorStrengths: OperatorStrengthEntry[];\n'
        '  inferredSignals: InferredSignalsSnapshot;\n'
        '  characterValuesAlignment: CharacterValuesAlignmentEntry[];\n'
        '}',
    )

    t = t.replace(
        'export const GROUP_SELECT =\n  "id, name, created_at, contact_groups(contact_id)";',
        'export const GROUP_SELECT =\n  "id, name, created_at, contact_groups(contact_id)";\n'
        'export const OPERATOR_STRENGTHS_SELECT = "id, content, created_at, updated_at";\n'
        'export const CALENDAR_SIGNAL_SELECT = "event_id, title, start, end, is_all_day";\n'
        'export const SLEEP_SIGNAL_SELECT = "record_id, started_at, ended_at, duration_minutes, quality";\n'
        'export const CHARACTER_ALIGNMENT_SELECT = '
        '"id, character_id, aligned, rank_position, character_name, character_source, character_values, created_at, updated_at";\n'
        'const CALENDAR_SIGNAL_WINDOW_DAYS = 7;\nconst SLEEP_SIGNAL_WINDOW_DAYS = 3;',
    )

    t = t.replace(
        'interface RawTransientSessionRow {\n  content: string;\n}\n\n// --- Mappers ---',
        'interface RawTransientSessionRow { content: string; }\n'
        'interface OperatorStrengthRow { id: string; content: string; created_at: string; updated_at: string; }\n'
        'interface RawCalendarSignalRow { event_id: string; title: string | null; start: string; end: string; is_all_day: boolean; }\n'
        'interface RawSleepSignalRow { record_id: string; started_at: string; ended_at: string; duration_minutes: number; quality: string | null; }\n'
        'interface CharacterValuesAlignmentRow { id: string; character_id: string; aligned: boolean; rank_position: number | null; character_name: string | null; character_source: string | null; character_values: string[] | null; created_at: string; updated_at: string; }\n\n'
        '// --- Mappers ---',
    )

    extra_mappers = '''
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
'''
    t = t.replace('// --- Fetch helpers (usable from Node and Deno) ---', extra_mappers + '\n// --- Fetch helpers (usable from Node and Deno) ---')

    extras = '''
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
'''
    t = t.replace('  return q.limit(cap);\n}\n\n/** Single parallel load', '  return q.limit(cap);\n}\n' + extras + '\n/** Single parallel load')
    cp.write_text(t)


def patch_pass_engine() -> None:
    pe = ROOT / "src/shared/src/agent/PassEngine.ts"
    t = pe.read_text()
    if "assembleUserContextForAmbientPass" in t:
        return
    t = t.replace(
        'import {\n  UserContextBuilder,\n  type UserContextSnapshot,\n} from "./UserContextBuilder";',
        'import type { UserContextSnapshot } from "./userContextCore";\n'
        'import { assembleUserContextForAmbientPass } from "./userContextProjections";',
    )
    if "runAgentPass" in t:
        t = t.replace('import {\n  UserContextBuilder,\n} from "./UserContextBuilder";',
                      'import type { UserContextSnapshot } from "./userContextCore";\n'
                      'import { assembleUserContextForAmbientPass } from "./userContextProjections";')
        t = t.replace('  userContextBuilder?: UserContextBuilder;',
                      '  buildUserContext?: (userId: string, asOf: Date, relationshipId: string) => Promise<UserContextSnapshot>;')
        t = t.replace('  private readonly userContextBuilder: UserContextBuilder;',
                      '  private readonly buildUserContext: (userId: string, asOf: Date, relationshipId: string) => Promise<UserContextSnapshot>;')
        t = t.replace(
            '    this.userContextBuilder =\n      opts.userContextBuilder ?? new UserContextBuilder({ supabase: opts.supabase });',
            '    this.buildUserContext = opts.buildUserContext ?? ((userId, asOf, relationshipId) =>\n'
            '      assembleUserContextForAmbientPass(this.supabase, { userId, asOf, excludeRelationshipId: relationshipId }));',
        )
        t = t.replace(
            '        buildUserContext: (userId, asOf) =>\n          this.userContextBuilder.buildUserContext(userId, asOf),',
            '        buildUserContext: (userId, asOf, relationshipId) =>\n          this.buildUserContext(userId, asOf, relationshipId),',
        )
    else:
        t = t.replace('  userContextBuilder?: UserContextBuilder;',
                      '  buildUserContext?: (userId: string, asOf: Date, relationshipId: string) => Promise<UserContextSnapshot>;')
        t = t.replace('  private readonly userContextBuilder: UserContextBuilder;',
                      '  private readonly buildUserContext: (userId: string, asOf: Date, relationshipId: string) => Promise<UserContextSnapshot>;')
        t = t.replace(
            '    this.userContextBuilder =\n      opts.userContextBuilder ?? new UserContextBuilder({ supabase: opts.supabase });',
            '    this.buildUserContext = opts.buildUserContext ?? ((userId, asOf, relationshipId) =>\n'
            '      assembleUserContextForAmbientPass(this.supabase, { userId, asOf, excludeRelationshipId: relationshipId }));',
        )
        t = t.replace(
            '    const userContext = await this.userContextBuilder.buildUserContext(\n      ownerId,\n      new Date(),\n    );',
            '    const userContext = await this.buildUserContext(ownerId, new Date(), relationshipId);',
        )
    pe.write_text(t)


def main() -> None:
    patch_core()
    (ROOT / "src/shared/src/agent/userContextProjections.ts").write_text(PROJECTIONS)
    (ROOT / "src/shared/src/agent/userContextCore.test.ts").write_text(TESTS)
    patch_pass_engine()

    for p in ["src/shared/src/agent/UserContextBuilder.ts", "src/shared/src/agent/UserContextBuilder.test.ts"]:
        Path(ROOT / p).unlink(missing_ok=True)

    (ROOT / "src/backend/supabase/functions/_shared/userContextCore.ts").write_text(
        'export * from "../../../../shared/src/agent/userContextCore.ts";\n')
    (ROOT / "src/backend/supabase/functions/_shared/userContextProjections.ts").write_text(
        'export * from "../../../../shared/src/agent/userContextProjections.ts";\n')
    (ROOT / "src/backend/supabase/functions/_shared/userContext.ts").write_text(
        'import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";\n'
        'import type { AmbientUserContextSnapshot } from "../../../../shared/src/agent/userContextCore.ts";\n'
        'import { assembleUserContextForAmbientPass } from "../../../../shared/src/agent/userContextProjections.ts";\n'
        'export type { AmbientUserContextSnapshot, AmbientUserContextSnapshot as UserContextSnapshot, '
        'GoalEntry, SituationalStateSnapshot, OperatorStrengthEntry } from "../../../../shared/src/agent/userContextCore.ts";\n'
        'export async function buildUserContext(supabase: SupabaseClient, userId: string, asOf: Date, relationshipId: string): Promise<AmbientUserContextSnapshot> {\n'
        '  return assembleUserContextForAmbientPass(supabase, { userId, asOf, excludeRelationshipId: relationshipId });\n}\n')

    apr = ROOT / "src/backend/supabase/functions/_shared/ambientPassRunner.ts"
    if apr.exists():
        apr.write_text(apr.read_text().replace(
            "buildUserContext(service, ownerId, new Date())",
            "buildUserContext(service, ownerId, new Date(), relationshipId)",
        ))

    apd = ROOT / "src/shared/src/agent/AmbientPassDispatcher.ts"
    apd.write_text(
        apd.read_text()
        .replace('import { UserContextBuilder } from "./UserContextBuilder";\n', "")
        .replace("        userContextBuilder: new UserContextBuilder({ supabase: opts.supabase }),\n        ", "")
    )

    apr2 = ROOT / "src/shared/src/agent/agentPassRun.ts"
    if apr2.exists():
        a = apr2.read_text().replace('from "./UserContextBuilder"', 'from "./userContextCore"')
        a = a.replace(
            "buildUserContext: (userId: string, asOf: Date) => Promise<UserContextSnapshot>;",
            "buildUserContext: (userId: string, asOf: Date, relationshipId: string) => Promise<UserContextSnapshot>;",
        )
        a = a.replace(
            "await deps.buildUserContext(ownerId, new Date())",
            "await deps.buildUserContext(ownerId, new Date(), relationshipId)",
        )
        apr2.write_text(a)

    idx = ROOT / "src/shared/src/index.ts"
    it = idx.read_text()
    old = '''export { UserContextBuilder } from "./agent/UserContextBuilder";
export {
  loadUserContextCore,
  USER_CONTEXT_CAPS,
  MS_PER_DAY as USER_CONTEXT_MS_PER_DAY,
} from "./agent/userContextCore";
export type {
  UserContextCoreSnapshot,
  LoadUserContextCoreOptions,
  TransientIntentLoadMode,
} from "./agent/userContextCore";
export {
  projectForAmbientPass,
  projectForConversationalTurn,
} from "./agent/userContextProjections";
export type {
  ConversationalUserContextSlice,
  ConversationalUserContextBundle,
} from "./agent/userContextProjections";
export type {
  UserContextSnapshot,
  AmbientUserContextSnapshot,
  GoalEntry,
  SituationalStateSnapshot,
  OperatorStrengthEntry,
} from "./agent/UserContextBuilder";
export type {
  CalendarDensitySignal,
  SleepSignal,
  UserContextGroupSummary,
  UserContextRelationshipSummary,
  CharacterValuesAlignmentEntry,
} from "./agent/userContextCore";'''
    new = '''export { loadUserContextCore, loadAmbientPassExtras, USER_CONTEXT_CAPS, MS_PER_DAY as USER_CONTEXT_MS_PER_DAY } from "./agent/userContextCore";
export type { UserContextCoreSnapshot, LoadUserContextCoreOptions, TransientIntentLoadMode, AmbientPassExtrasSnapshot } from "./agent/userContextCore";
export { projectForAmbientPass, projectForConversationalTurn, projectForEngagedPass, assembleUserContextForAmbientPass, AMBIENT_PASS_USER_CONTEXT_FLAVOURS, CONVERSATIONAL_USER_CONTEXT_FLAVOURS } from "./agent/userContextProjections";
export type { ConversationalUserContextSlice, ConversationalUserContextBundle, AssembleAmbientUserContextOptions } from "./agent/userContextProjections";
export type { UserContextSnapshot, AmbientUserContextSnapshot, GoalEntry, SituationalStateSnapshot, OperatorStrengthEntry, InferredSignalsSnapshot, CalendarDensitySignal, SleepSignal, UserContextGroupSummary, UserContextRelationshipSummary, CharacterValuesAlignmentEntry } from "./agent/userContextCore";'''
    if old in it:
        idx.write_text(it.replace(old, new))

    pet = ROOT / "src/shared/src/agent/PassEngine.test.ts"
    pt = pet.read_text()
    pt = pt.replace('from "./UserContextBuilder"', 'from "./userContextCore"')
    pt = pt.replace('import type { UserContextBuilder } from "./userContextBuilder";\n', '')
    pt = pt.replace('import type { UserContextBuilder } from "./UserContextBuilder";\n', '')
    if "transientIntent: []" not in pt:
        pt = pt.replace(
            'operatorStrengths: [],\n});',
            'operatorStrengths: [],\n  inferredSignals: { calendarDensity: null, sleep: null, calendarEvents: [], sleepRecords: [] },\n  transientIntent: [], groups: [], otherRelationships: [], characterValuesAlignment: [],\n});',
        )
    pt = pt.replace("userContextBuilder", "buildUserContext")
    pt = pt.replace("buildUserContext.buildUserContext", "buildUserContext")
    pt = pt.replace("as unknown as UserContextBuilder", "")
    pt = pt.replace("loads ambient user context (goals, situational, strengths only)", "loads ambient user context via assembleUserContextForAmbientPass seam")
    pt = pt.replace(
        'expect(buildUserContext).toHaveBeenCalledWith(\n      "u-1",\n      expect.any(Date),\n    );',
        'expect(buildUserContext).toHaveBeenCalledWith("u-1", expect.any(Date), "r-1");',
    )
    pet.write_text(pt)
    print("consolidation complete")


if __name__ == "__main__":
    main()
