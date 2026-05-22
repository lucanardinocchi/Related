// Tool query builders for the read-only chat-respond tool surface.

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";
import {
  fetchSituationalState,
  GOALS_SELECT,
} from "../../../../../shared/src/agent/userContextCore.ts";
import { SNAPSHOT_CAPS } from "../../_shared/conversational/snapshot.ts";
import {
  GROUP_SELECT_DETAIL,
  GROUP_SELECT_LIST,
  INTERACTION_SELECT_TOOL,
  OPEN_THREAD_SELECT_TOOL,
  RELATIONSHIP_SELECT_TOOL,
  TRANSIENT_SELECT_TOOL,
} from "./selects.ts";

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
  const now = new Date();
  const [goals, ss, ti] = await Promise.all([
    supabase.from("goals_and_values").select(GOALS_SELECT).order("created_at", {
      ascending: false,
    }),
    fetchSituationalState(supabase),
    supabase
      .from("transient_intent")
      .select(TRANSIENT_SELECT_TOOL)
      .gt("expires_at", now.toISOString())
      .order("captured_at", { ascending: false })
      .limit(SNAPSHOT_CAPS.transientIntent),
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
