import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface Group {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * A Relationship whose target is a Group. Mirrors the Contact-targeted
 * `Relationship` shape in RelationshipsClient — the polymorphic ADR-0004
 * design surfaces them on separate UI pages but the agent loop treats both
 * uniformly.
 */
export interface GroupRelationship {
  id: string;
  targetType: "group";
  createdAt: string;
  group: Group;
}

export interface GroupMember {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
}

interface ContactRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

interface MembershipRow {
  contact: ContactRow;
}

interface GroupRelationshipRow {
  id: string;
  target_type: "group";
  created_at: string;
  group: GroupRow;
}

interface ContactGroupRow {
  group: GroupRow & {
    relationships: { id: string; created_at: string }[];
  };
}

function toGroupRelationship(row: GroupRelationshipRow): GroupRelationship {
  return {
    id: row.id,
    targetType: row.target_type,
    createdAt: row.created_at,
    group: toGroup(row.group),
  };
}

function toMember(row: ContactRow): GroupMember {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
  };
}

export interface CreateGroupInput {
  name: string;
}

export interface MembershipInput {
  groupId: string;
  contactId: string;
}

export interface GroupsClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface GroupRow {
  id: string;
  name: string;
  created_at: string;
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

/**
 * Reads and writes Group rows + Contact ↔ Group membership on behalf of the
 * signed-in User. RLS enforces ownership server-side; cross-user link
 * attempts are rejected at the composite-FK level on contact_groups (see
 * migration 20260518000005). This client adds no extra gating.
 */
export class GroupsClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(config: GroupsClientConfig): GroupsClient {
    return new GroupsClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  async createGroup(input: CreateGroupInput): Promise<Group> {
    const { data, error } = await this.client
      .from("groups")
      .insert({ name: input.name })
      .select()
      .single();
    if (error) throw error;
    return toGroup(data as GroupRow);
  }

  async addMember(input: MembershipInput): Promise<void> {
    const { error } = await this.client.rpc("add_group_member", {
      p_group_id: input.groupId,
      p_contact_id: input.contactId,
    });
    if (error) throw error;
  }

  /**
   * Groups the given Contact belongs to, returned as the back-reference
   * shape the Single Relationship view shows (each entry is the Group's
   * auto-paired Relationship so taps can navigate straight into the Single
   * Group view).
   */
  async listForContact(contactId: string): Promise<GroupRelationship[]> {
    const { data, error } = await this.client
      .from("contact_groups")
      .select(
        "group:groups(id, name, created_at, relationships(id, created_at))",
      )
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as ContactGroupRow[]).flatMap((row) => {
      // The auto-pair trigger guarantees exactly one Relationship per Group,
      // but the embed comes back as an array. Skip silently if for some
      // reason the row is empty rather than crashing the screen.
      const rel = row.group.relationships?.[0];
      if (!rel) return [];
      return [
        {
          id: rel.id,
          targetType: "group" as const,
          createdAt: rel.created_at,
          group: toGroup(row.group),
        },
      ];
    });
  }

  async listGroupRelationships(): Promise<GroupRelationship[]> {
    const { data, error } = await this.client
      .from("relationships")
      .select(
        "id, target_type, created_at, group:groups(id, name, created_at)",
      )
      .eq("target_type", "group")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as GroupRelationshipRow[]).map(
      toGroupRelationship,
    );
  }

  async listGroups(): Promise<Group[]> {
    const { data, error } = await this.client
      .from("groups")
      .select("id, name, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as GroupRow[]).map(toGroup);
  }

  async listMembers(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await this.client
      .from("contact_groups")
      .select("contact:contacts(id, name, phone, email, created_at)")
      .eq("group_id", groupId)
      .order("contacts(name)", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as MembershipRow[]).map((r) =>
      toMember(r.contact),
    );
  }

  async removeMember(input: MembershipInput): Promise<void> {
    const { error } = await this.client.rpc("remove_group_member", {
      p_group_id: input.groupId,
      p_contact_id: input.contactId,
    });
    if (error) throw error;
  }

  /**
   * Get a single Group by id. Used by the web /groups/[id] detail page; the
   * mobile equivalent passes the full Group via nav param so doesn't need
   * this. RLS hides cross-User rows — `single()` throws if not found.
   */
  async getGroup(id: string): Promise<Group> {
    const { data, error } = await this.client
      .from("groups")
      .select("id, name, created_at")
      .eq("id", id)
      .single();
    if (error) throw error;
    return toGroup(data as GroupRow);
  }

  async updateGroup(
    id: string,
    input: { name?: string },
  ): Promise<Group> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;

    const { data, error } = await this.client
      .from("groups")
      .update(patch)
      .eq("id", id)
      .select("id, name, created_at")
      .single();
    if (error) throw error;
    return toGroup(data as GroupRow);
  }

  async deleteGroup(id: string): Promise<void> {
    const { error } = await this.client.from("groups").delete().eq("id", id);
    if (error) throw error;
  }
}
