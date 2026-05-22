import type { SupabaseClient } from "npm:@supabase/supabase-js@^2.45.0";

export type CaptureSource =
  | "conversational_extraction"
  | "pocket_extraction";

export interface ChatRow {
  id: string;
  owner_id: string;
  title: string | null;
  source: string;
  closed_at: string;
  extracted_at: string | null;
}

export interface MessageRow {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
}

export interface RelationshipDirectoryEntry {
  id: string;
  targetType: "contact" | "group";
  name: string;
  role: string | null;
  targetContactId: string | null;
  targetGroupId: string | null;
}

export interface ResolvedRelationship {
  id: string;
  targetType: "contact" | "group";
  targetContactId: string | null;
  targetGroupId: string | null;
}

export interface ToolContext {
  supabase: SupabaseClient;
  ownerId: string;
  chatId: string;
  captureSource: CaptureSource;
  defaultTime: string;
}

export interface ExtractionSummary {
  notesLogged: number;
  interactionsLogged: number;
  commsLogged: number;
  commitmentsOpened: number;
  toolErrors: string[];
}
