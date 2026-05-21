import {
  createClient,
  SupabaseClient,
} from "@supabase/supabase-js";

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  // Profile fields added per ADR-0008 for the web Relationship detail page.
  birthday: string | null; // ISO date (YYYY-MM-DD)
  /** Display label for the contact's location, e.g. "Surry Hills, NSW, Australia". */
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  occupation: string | null;
  education: string | null;
  createdAt: string;
}

export interface CreateContactInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  occupation?: string | null;
  education?: string | null;
}

export interface UpdateContactInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  occupation?: string | null;
  education?: string | null;
}

export interface Relationship {
  id: string;
  targetType: "contact";
  createdAt: string;
  /**
   * Free-text User-curated label for what this person is to them — e.g.
   * "close friend", "mentor". Nullable until the User (or the agent's
   * UpdateRoleOrCadence action) writes one.
   */
  role: string | null;
  /**
   * Free-text User-curated touch interval — e.g. "weekly", "every few
   * months". Nullable until set.
   */
  cadence: string | null;
  contact: Contact;
}

export interface UpdateRelationshipInput {
  role?: string | null;
  cadence?: string | null;
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
  birthday: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  occupation: string | null;
  education: string | null;
  created_at: string;
}

interface RelationshipRow {
  id: string;
  target_type: "contact";
  created_at: string;
  role: string | null;
  cadence: string | null;
  contact: ContactRow;
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    birthday: row.birthday,
    area: row.area,
    latitude: row.latitude,
    longitude: row.longitude,
    occupation: row.occupation,
    education: row.education,
    createdAt: row.created_at,
  };
}

function toRelationship(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    targetType: row.target_type,
    createdAt: row.created_at,
    role: row.role,
    cadence: row.cadence,
    contact: toContact(row.contact),
  };
}

const CONTACT_COLUMNS =
  "id, name, phone, email, birthday, area, latitude, longitude, occupation, education, created_at";

const RELATIONSHIP_SELECT =
  `id, target_type, created_at, role, cadence, contact:contacts!target_contact_id(${CONTACT_COLUMNS})`;

/**
 * Reads and writes Contact + Relationship rows on behalf of the signed-in
 * User. RLS enforces ownership server-side — this client adds no extra
 * gating. Inserting a Contact causes Postgres to also create the paired
 * Relationship via trigger (see migration 20260517000002). Update and
 * delete on both tables were unlocked by 20260520000003 (ADR-0008) so the
 * web Relationship detail page can land inline edits.
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
        birthday: input.birthday ?? null,
        area: input.area ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        occupation: input.occupation ?? null,
        education: input.education ?? null,
      })
      .select(CONTACT_COLUMNS)
      .single();
    if (error) throw error;
    return toContact(data as ContactRow);
  }

  async updateContact(id: string, input: UpdateContactInput): Promise<Contact> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.email !== undefined) patch.email = input.email;
    if (input.birthday !== undefined) patch.birthday = input.birthday;
    if (input.area !== undefined) patch.area = input.area;
    if (input.latitude !== undefined) patch.latitude = input.latitude;
    if (input.longitude !== undefined) patch.longitude = input.longitude;
    if (input.occupation !== undefined) patch.occupation = input.occupation;
    if (input.education !== undefined) patch.education = input.education;

    const { data, error } = await this.client
      .from("contacts")
      .update(patch)
      .eq("id", id)
      .select(CONTACT_COLUMNS)
      .single();
    if (error) throw error;
    return toContact(data as ContactRow);
  }

  async deleteContact(id: string): Promise<void> {
    const { error } = await this.client.from("contacts").delete().eq("id", id);
    if (error) throw error;
  }

  async listRelationships(): Promise<Relationship[]> {
    // Server-side filter: Slice 6's groups trigger means the relationships
    // table also contains target_type='group' rows whose embedded contact is
    // null. The "All Relationships" surface is Contact-only — Group-targeted
    // rows surface via the dedicated Groups tab path.
    const { data, error } = await this.client
      .from("relationships")
      .select(RELATIONSHIP_SELECT)
      .eq("target_type", "contact")
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

  async updateRelationship(
    id: string,
    input: UpdateRelationshipInput,
  ): Promise<Relationship> {
    const patch: Record<string, unknown> = {};
    if (input.role !== undefined) patch.role = input.role;
    if (input.cadence !== undefined) patch.cadence = input.cadence;

    const { data, error } = await this.client
      .from("relationships")
      .update(patch)
      .eq("id", id)
      .select(RELATIONSHIP_SELECT)
      .single();
    if (error) throw error;
    return toRelationship(data as unknown as RelationshipRow);
  }

  async deleteRelationship(id: string): Promise<void> {
    const { error } = await this.client
      .from("relationships")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }
}
