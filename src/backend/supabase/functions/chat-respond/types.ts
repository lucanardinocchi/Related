// Shared types for chat-respond's modular pieces.
// Kept in a single file so prompt.ts, contextLoader.ts, tools.ts and
// index.ts can reach for the same shapes without circular imports.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

export interface ToolContext {
  supabase: SupabaseClient;
}

export interface ToolCallSummary {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result_preview: string;
  error?: string;
}

export interface ChatMessageRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls: unknown[] | null;
  tool_call_id: string | null;
  created_at: string;
}

export interface RelationshipSummary {
  id: string;
  target_type: "contact" | "group";
  role: string | null;
  cadence: string | null;
  name: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  member_count: number;
}

export interface OpenThreadSummary {
  id: string;
  description: string;
  direction: "me_owes_them" | "they_owe_me";
  days_outstanding: number;
  relationship_ids: string[];
}

export interface InteractionSummary {
  id: string;
  time: string;
  kind: string | null;
  status: string | null;
  contact_ids: string[];
}

export interface TransientIntentSummary {
  content: string;
  captured_at: string;
  relationship_id: string | null;
}

export interface ConversationContextSnapshot {
  /** ISO timestamp at which the snapshot was assembled. */
  asOf: string;
  /** Compact relationship list — full profile is tool-fetchable. */
  relationships: RelationshipSummary[];
  /** Total relationships if more than the cap above. */
  relationshipsTotal: number;
  groups: GroupSummary[];
  userContext: {
    goalsAndValues: string[];
    situationalState: string | null;
    recentTransientIntent: TransientIntentSummary[];
  };
  /** Open (not yet closed) threads only. */
  openThreads: OpenThreadSummary[];
  openThreadsTotal: number;
  /** Last 30 days, newest first. */
  recentInteractions: InteractionSummary[];
  recentInteractionsTotal: number;
}
