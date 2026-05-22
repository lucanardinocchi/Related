import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommsTimelineItem } from "../comms/relationshipCommsTimeline";
import type {
  CommitmentCommunicationStatus,
  CommitmentOrigin,
  ThreadDirection,
} from "../open-threads/OpenThreadsClient";
import type { InteractionCategory, InteractionStatus } from "../interactions/InteractionsClient";
import {
  loadRelationshipAmbientExtras,
  type RelationshipContextEvent,
  type SuggestedActionHistoryEntry,
} from "./loadRelationshipAmbientContext.ts";

const CONTACT_COLUMNS =
  "id, name, phone, email, birthday, area, latitude, longitude, occupation, education, instagram_username, instagram_scoped_id, x_username, x_user_id, tiktok_username, tiktok_open_id, whatsapp_wa_id, created_at, updated_at";

const RELATIONSHIP_BASE_SELECT = `
  id, owner_id, target_type, target_contact_id, target_group_id,
  role, cadence, created_at, updated_at
`;

const INTERACTION_SELECT =
  "id, time, kind, category, notes, status, group_id, created_at, updated_at, interaction_contacts(contact_id, contacts(id, name))";

const CONTACT_INTERACTION_SELECT =
  "id, time, kind, category, notes, status, group_id, created_at, updated_at, interaction_contacts!inner(contact_id, contacts(id, name))";

const OPEN_THREAD_SELECT =
  "open_threads(id, description, direction, origin, communication_status, created_at, closed_at)";

const GROUP_MEMBER_SELECT = `contact_groups(contact_id, contacts(${CONTACT_COLUMNS}))`;

export type { RelationshipContextEvent, SuggestedActionHistoryEntry };

/** Contact profile fields loaded for agent Relationship context. */
export interface RelationshipContextContact {
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
  updated_at: string;
}

export interface RelationshipContextGroup {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type RelationshipContextTargetType = "contact" | "group";

/** Relationship row embedded in a Pass prompt (snake_case matches Supabase / serialisation). */
export interface RelationshipContextRelationship {
  id: string;
  owner_id?: string;
  target_type?: RelationshipContextTargetType;
  target_contact_id?: string | null;
  target_group_id?: string | null;
  role?: string | null;
  cadence?: string | null;
  created_at?: string;
  updated_at?: string;
  contact?: RelationshipContextContact | null;
  group?: RelationshipContextGroup | null;
}

export interface RelationshipContextInteractionContact {
  contact_id: string;
  contacts: { id: string; name: string } | null;
}

/** Interaction touchpoint loaded for agent Relationship context. */
export interface RelationshipContextInteraction {
  id: string;
  time: string;
  kind: string;
  category: InteractionCategory;
  notes: string | null;
  status: InteractionStatus;
  group_id: string | null;
  created_at: string;
  updated_at: string;
  interaction_contacts: RelationshipContextInteractionContact[];
}

export interface RelationshipContextOpenThread {
  id: string;
  description: string;
  direction: ThreadDirection;
  origin: CommitmentOrigin | null;
  communication_status: CommitmentCommunicationStatus;
  created_at: string;
  closed_at: string | null;
}

/** Join row from `open_thread_relationships` with nested Open Thread. */
export interface RelationshipContextOpenThreadLink {
  open_threads: RelationshipContextOpenThread;
}

export interface RelationshipContextGroupMember {
  contact_id: string;
  contacts: RelationshipContextContact;
}

export interface RelationshipContextSnapshot {
  relationship: RelationshipContextRelationship;
  interactions: RelationshipContextInteraction[];
  openThreads: RelationshipContextOpenThreadLink[];
  contact: RelationshipContextContact | null;
  groupMembers: RelationshipContextGroupMember[];
  /** Cached platform messages (email, social, iMessage relay) for this Relationship. */
  platformComms: CommsTimelineItem[];
  /** Calendar events where a focal Contact (or Group member) is an attendee. */
  calendarEvents: RelationshipContextEvent[];
  /** All past Candidate Actions for this Relationship with approval / execution flags. */
  suggestedActionHistory: SuggestedActionHistoryEntry[];
}

export interface RelationshipContextBuilderOptions {
  supabase?: SupabaseClient;
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
  updated_at: string;
}

interface GroupRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface RelationshipRow {
  id: string;
  owner_id: string;
  target_type: RelationshipContextTargetType;
  target_contact_id: string | null;
  target_group_id: string | null;
  role: string | null;
  cadence: string | null;
  created_at: string;
  updated_at: string;
  contact?: ContactRow | null;
  group?: GroupRow | null;
}

interface InteractionContactRow {
  contact_id: string;
  contacts: { id: string; name: string } | null;
}

interface InteractionRow {
  id: string;
  time: string;
  kind: string;
  category: InteractionCategory;
  notes: string | null;
  status: InteractionStatus;
  group_id: string | null;
  created_at: string;
  updated_at: string;
  interaction_contacts?: InteractionContactRow[];
}

interface OpenThreadRow {
  id: string;
  description: string;
  direction: ThreadDirection;
  origin: CommitmentOrigin | null;
  communication_status: CommitmentCommunicationStatus;
  created_at: string;
  closed_at: string | null;
}

interface OpenThreadLinkRow {
  open_threads: OpenThreadRow;
}

interface GroupMemberRow {
  contact_id: string;
  contacts: ContactRow;
}

function mapContact(row: ContactRow): RelationshipContextContact {
  return { ...row };
}

function mapGroup(row: GroupRow): RelationshipContextGroup {
  return { ...row };
}

function mapRelationship(
  row: RelationshipRow,
): RelationshipContextRelationship {
  return {
    id: row.id,
    owner_id: row.owner_id,
    target_type: row.target_type,
    target_contact_id: row.target_contact_id,
    target_group_id: row.target_group_id,
    role: row.role,
    cadence: row.cadence,
    created_at: row.created_at,
    updated_at: row.updated_at,
    contact: row.contact ? mapContact(row.contact) : null,
    group: row.group ? mapGroup(row.group) : null,
  };
}

function mapInteraction(row: InteractionRow): RelationshipContextInteraction {
  return {
    id: row.id,
    time: row.time,
    kind: row.kind,
    category: row.category,
    notes: row.notes,
    status: row.status,
    group_id: row.group_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    interaction_contacts: (row.interaction_contacts ?? []).map((link) => ({
      contact_id: link.contact_id,
      contacts: link.contacts,
    })),
  };
}

function mapOpenThreadLink(
  row: OpenThreadLinkRow,
): RelationshipContextOpenThreadLink {
  return {
    open_threads: { ...row.open_threads },
  };
}

function mapGroupMember(row: GroupMemberRow): RelationshipContextGroupMember {
  return {
    contact_id: row.contact_id,
    contacts: mapContact(row.contacts),
  };
}

export class RelationshipContextBuilder {
  private readonly supabase?: SupabaseClient;

  constructor(opts: RelationshipContextBuilderOptions = {}) {
    this.supabase = opts.supabase;
  }

  async buildRelationshipContext(
    relationshipId: string,
  ): Promise<RelationshipContextSnapshot> {
    if (!this.supabase) {
      return {
        relationship: { id: relationshipId },
        interactions: [],
        openThreads: [],
        contact: null,
        groupMembers: [],
        platformComms: [],
        calendarEvents: [],
        suggestedActionHistory: [],
      };
    }

    const { data: relationship, error: relErr } = await this.supabase
      .from("relationships")
      .select(RELATIONSHIP_BASE_SELECT)
      .eq("id", relationshipId)
      .single();
    if (relErr || !relationship) {
      throw relErr ?? new Error(`relationship ${relationshipId} not found`);
    }

    const row = relationship as unknown as RelationshipRow;
    const [contact, group, interactions, openThreads, groupMembers] =
      await Promise.all([
        row.target_type === "contact" && row.target_contact_id
          ? this.loadContact(row.target_contact_id)
          : Promise.resolve(null),
        row.target_type === "group" && row.target_group_id
          ? this.loadGroup(row.target_group_id)
          : Promise.resolve(null),
        this.loadInteractions(row),
        this.loadOpenThreads(relationshipId),
        row.target_type === "group" && row.target_group_id
          ? this.loadGroupMembers(row.target_group_id)
          : Promise.resolve([]),
      ]);

    if (contact) row.contact = contact;
    if (group) row.group = group;

    const mappedRelationship = mapRelationship(row);

    const base: RelationshipContextSnapshot = {
      relationship: mappedRelationship,
      interactions,
      openThreads,
      contact: contact ? mapContact(contact) : null,
      groupMembers,
      platformComms: [],
      calendarEvents: [],
      suggestedActionHistory: [],
    };

    const extras = await loadRelationshipAmbientExtras(
      this.supabase,
      base,
      relationshipId,
    );
    return { ...base, ...extras };
  }

  private async loadContact(contactId: string): Promise<ContactRow> {
    if (!this.supabase) throw new Error("supabase client required");
    const { data, error } = await this.supabase
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("id", contactId)
      .single();
    if (error || !data) {
      throw error ?? new Error(`contact ${contactId} not found`);
    }
    return data as ContactRow;
  }

  private async loadGroup(groupId: string): Promise<GroupRow> {
    if (!this.supabase) throw new Error("supabase client required");
    const { data, error } = await this.supabase
      .from("groups")
      .select("id, name, created_at, updated_at")
      .eq("id", groupId)
      .single();
    if (error || !data) {
      throw error ?? new Error(`group ${groupId} not found`);
    }
    return data as GroupRow;
  }

  private async loadInteractions(
    row: RelationshipRow,
  ): Promise<RelationshipContextInteraction[]> {
    if (!this.supabase) return [];

    if (row.target_type === "group" && row.target_group_id) {
      const { data, error } = await this.supabase
        .from("interactions")
        .select(INTERACTION_SELECT)
        .eq("group_id", row.target_group_id)
        .order("time", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as InteractionRow[]).map(mapInteraction);
    }

    if (row.target_type === "contact" && row.target_contact_id) {
      const { data, error } = await this.supabase
        .from("interactions")
        .select(CONTACT_INTERACTION_SELECT)
        .eq("interaction_contacts.contact_id", row.target_contact_id)
        .order("time", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as InteractionRow[]).map(mapInteraction);
    }

    return [];
  }

  private async loadOpenThreads(
    relationshipId: string,
  ): Promise<RelationshipContextOpenThreadLink[]> {
    if (!this.supabase) return [];

    const { data, error } = await this.supabase
      .from("open_thread_relationships")
      .select(OPEN_THREAD_SELECT)
      .eq("relationship_id", relationshipId);
    if (error) throw error;
    return ((data ?? []) as unknown as OpenThreadLinkRow[])
      .map(mapOpenThreadLink)
      .sort((a, b) =>
        a.open_threads.created_at.localeCompare(b.open_threads.created_at),
      );
  }

  private async loadGroupMembers(
    groupId: string,
  ): Promise<RelationshipContextGroupMember[]> {
    if (!this.supabase) return [];

    const { data, error } = await this.supabase
      .from("groups")
      .select(GROUP_MEMBER_SELECT)
      .eq("id", groupId)
      .single();
    if (error) throw error;

    const members =
      (data as unknown as { contact_groups?: GroupMemberRow[] } | null)
        ?.contact_groups ?? [];
    return members.map(mapGroupMember);
  }
}
