import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Relationship Context — per-Relationship narrative singleton, per the
 * ADR-0009 amendment of 2026-05-21. Written by the Extraction Pass when it
 * sorts a closed Chat transcript by Relationship; read by the next Agent
 * Pass alongside User Context. The User may also edit directly when the
 * agent mis-attributes.
 */
export interface RelationshipContext {
  id: string;
  relationshipId: string;
  content: string;
  sourceChatId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipContextClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface RelationshipContextRow {
  id: string;
  relationship_id: string;
  content: string;
  source_chat_id: string | null;
  created_at: string;
  updated_at: string;
}

function toRow(row: RelationshipContextRow): RelationshipContext {
  return {
    id: row.id,
    relationshipId: row.relationship_id,
    content: row.content,
    sourceChatId: row.source_chat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  "id, relationship_id, content, source_chat_id, created_at, updated_at";

/**
 * Caller-provided resolver for the signed-in User's id. Mirrors the
 * UserContextClient pattern so we don't double up on `auth.getUser()`.
 */
export type OwnerIdResolver = () => Promise<string>;

export class RelationshipContextClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly resolveOwnerId: OwnerIdResolver,
  ) {}

  static fromConfig(
    config: RelationshipContextClientConfig,
    resolveOwnerId: OwnerIdResolver,
  ): RelationshipContextClient {
    return new RelationshipContextClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
      resolveOwnerId,
    );
  }

  async getForRelationship(
    relationshipId: string,
  ): Promise<RelationshipContext | null> {
    const { data, error } = await this.client
      .from("relationship_context")
      .select(SELECT_COLUMNS)
      .eq("relationship_id", relationshipId)
      .maybeSingle();
    if (error) throw error;
    return data ? toRow(data as RelationshipContextRow) : null;
  }

  async listAll(): Promise<RelationshipContext[]> {
    const { data, error } = await this.client
      .from("relationship_context")
      .select(SELECT_COLUMNS)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as RelationshipContextRow[]).map(toRow);
  }

  /**
   * Replace-or-create the per-Relationship narrative. Same merge contract
   * as Situational State — the caller (User or Extraction Pass) supplies
   * the full new text; this method does not merge prior + new.
   */
  async upsert(
    relationshipId: string,
    content: string,
    sourceChatId: string | null = null,
  ): Promise<RelationshipContext> {
    const ownerId = await this.resolveOwnerId();
    const { data, error } = await this.client
      .from("relationship_context")
      .upsert(
        {
          owner_id: ownerId,
          relationship_id: relationshipId,
          content,
          source_chat_id: sourceChatId,
        },
        { onConflict: "relationship_id" },
      )
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return toRow(data as RelationshipContextRow);
  }

  async deleteForRelationship(relationshipId: string): Promise<void> {
    const { error } = await this.client
      .from("relationship_context")
      .delete()
      .eq("relationship_id", relationshipId);
    if (error) throw error;
  }
}
