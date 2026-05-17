import {
  createClient,
  SupabaseClient,
} from "@supabase/supabase-js";

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
}

export interface CreateContactInput {
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface Relationship {
  id: string;
  targetType: "contact";
  createdAt: string;
  contact: Contact;
}

export interface RelationshipsClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface ContactRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

interface RelationshipRow {
  id: string;
  target_type: "contact";
  created_at: string;
  contact: ContactRow;
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
  };
}

function toRelationship(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    targetType: row.target_type,
    createdAt: row.created_at,
    contact: toContact(row.contact),
  };
}

const RELATIONSHIP_SELECT =
  "id, target_type, created_at, contact:contacts!target_contact_id(id, name, phone, email, created_at)";

/**
 * Reads and writes Contact + Relationship rows on behalf of the signed-in
 * User. RLS enforces ownership server-side — this client adds no extra
 * gating. Inserting a Contact causes Postgres to also create the paired
 * Relationship via trigger (see migration 20260517000002).
 */
export class RelationshipsClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(config: RelationshipsClientConfig): RelationshipsClient {
    return new RelationshipsClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  async createContact(input: CreateContactInput): Promise<Contact> {
    const { data, error } = await this.client
      .from("contacts")
      .insert({
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toContact(data as ContactRow);
  }

  async listRelationships(): Promise<Relationship[]> {
    const { data, error } = await this.client
      .from("relationships")
      .select(RELATIONSHIP_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as RelationshipRow[]).map(toRelationship);
  }

  async getRelationship(id: string): Promise<Relationship> {
    const { data, error } = await this.client
      .from("relationships")
      .select(RELATIONSHIP_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;
    return toRelationship(data as unknown as RelationshipRow);
  }
}
