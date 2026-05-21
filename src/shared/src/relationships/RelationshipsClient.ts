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
  /** Instagram handle without @ — used to match DM conversations. */
  instagramUsername: string | null;
  /** Instagram-scoped user ID (IGSID) — required to send DMs via the API. */
  instagramScopedId: string | null;
  /** X handle without @ — used to match DM conversations. */
  xUsername: string | null;
  /** X user ID — required to send DMs via the API. */
  xUserId: string | null;
  /** TikTok handle without @ — used to match DM conversations. */
  tiktokUsername: string | null;
  /** TikTok open ID — required to send DMs via the API. */
  tiktokOpenId: string | null;
  /** WhatsApp user ID (E.164 digits without +) — used to send DMs via the API. */
  whatsappWaId: string | null;
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
  instagramUsername?: string | null;
  instagramScopedId?: string | null;
  xUsername?: string | null;
  xUserId?: string | null;
  tiktokUsername?: string | null;
  tiktokOpenId?: string | null;
  whatsappWaId?: string | null;
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
  instagramUsername?: string | null;
  instagramScopedId?: string | null;
  xUsername?: string | null;
  xUserId?: string | null;
  tiktokUsername?: string | null;
  tiktokOpenId?: string | null;
  whatsappWaId?: string | null;
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
  instagram_username: string | null;
  instagram_scoped_id: string | null;
  x_username: string | null;
  x_user_id: string | null;
  tiktok_username: string | null;
  tiktok_open_id: string | null;
  whatsapp_wa_id: string | null;
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
    instagramUsername: row.instagram_username,
    instagramScopedId: row.instagram_scoped_id,
    xUsername: row.x_username,
    xUserId: row.x_user_id,
    tiktokUsername: row.tiktok_username,
    tiktokOpenId: row.tiktok_open_id,
    whatsappWaId: row.whatsapp_wa_id,
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
  "id, name, phone, email, birthday, area, latitude, longitude, occupation, education, instagram_username, instagram_scoped_id, x_username, x_user_id, tiktok_username, tiktok_open_id, whatsapp_wa_id, created_at";

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
        instagram_username: input.instagramUsername ?? null,
        instagram_scoped_id: input.instagramScopedId ?? null,
        x_username: input.xUsername ?? null,
        x_user_id: input.xUserId ?? null,
        tiktok_username: input.tiktokUsername ?? null,
        tiktok_open_id: input.tiktokOpenId ?? null,
        whatsapp_wa_id: input.whatsappWaId ?? null,
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
    if (input.instagramUsername !== undefined) {
      patch.instagram_username = input.instagramUsername;
    }
    if (input.instagramScopedId !== undefined) {
      patch.instagram_scoped_id = input.instagramScopedId;
    }
    if (input.xUsername !== undefined) {
      patch.x_username = input.xUsername;
    }
    if (input.xUserId !== undefined) {
      patch.x_user_id = input.xUserId;
    }
    if (input.tiktokUsername !== undefined) {
      patch.tiktok_username = input.tiktokUsername;
    }
    if (input.tiktokOpenId !== undefined) {
      patch.tiktok_open_id = input.tiktokOpenId;
    }
    if (input.whatsappWaId !== undefined) {
      patch.whatsapp_wa_id = input.whatsappWaId;
    }

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
