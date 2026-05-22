// Shared types for chat-respond's modular pieces.
// Snapshot shapes live in @related/shared conversational module.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

export type {
  ConversationContextSnapshot,
  GroupSummary,
  InteractionSummary,
  OpenThreadSummary,
  RelationshipSummary,
  ToolCallSummary,
  TransientIntentSummary,
} from "../../../../shared/src/conversational/types.ts";

export interface ToolContext {
  supabase: SupabaseClient;
}

export interface ChatMessageRow {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls: unknown[] | null;
  tool_call_id: string | null;
  created_at: string;
}
