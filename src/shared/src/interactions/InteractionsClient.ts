import {
  createClient,
  SupabaseClient,
} from "@supabase/supabase-js";

export type InteractionStatus =
  | "planned"
  | "occurred"
  | "attended"
  | "missed"
  | "cancelled";

/**
 * Category — the User-facing "what kind of thing is this" axis on the
 * Calendar. Distinct from the per-Interaction `kind` label (which carries
 * the conversational verb — call / text / coffee) and applies to past and
 * future entries alike. Surfaces as the chart filter and inline picker.
 */
export type InteractionCategory =
  | "work"
  | "meeting"
  | "activity"
  | "personal"
  | "errands";

/** How a timeline row was captured — see ADR-0012. */
export type ContextCaptureSource =
  | "manual"
  | "conversational_extraction"
  | "pocket_extraction";

export interface InteractionContact {
  id: string;
  name: string;
}

export interface Interaction {
  id: string;
  time: string;
  kind: string;
  category: InteractionCategory;
  notes: string | null;
  status: InteractionStatus;
  contacts: InteractionContact[];
  captureSource: ContextCaptureSource;
  sourceChatId: string | null;
}

export interface CreateInteractionInput {
  time: string;
  kind: string;
  category?: InteractionCategory;
  notes?: string | null;
  status: InteractionStatus;
  contactIds: string[];
  /**
   * Optional Group linkage. When set, the Interaction is logged in Group
   * mode: it touches the Group Relationship AND every current member
   * Contact's Relationship (member contact links are populated server-side
   * at capture time). Group-mode is explicit per ADR-0004 — a 1:1 with a
   * member Contact must leave groupId undefined.
   */
  groupId?: string;
}

export interface InteractionsClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface InteractionRow {
  id: string;
  time: string;
  kind: string;
  category: InteractionCategory;
  notes: string | null;
  status: InteractionStatus;
  capture_source: ContextCaptureSource;
  source_chat_id: string | null;
  interaction_contacts: {
    contact_id: string;
    contacts: { name: string } | null;
  }[];
}

const SELECT_WITH_CONTACTS =
  "id, time, kind, category, notes, status, capture_source, source_chat_id, interaction_contacts(contact_id, contacts(name))";

function toInteraction(row: InteractionRow): Interaction {
  return {
    id: row.id,
    time: row.time,
    kind: row.kind,
    category: row.category,
    notes: row.notes,
    status: row.status,
    captureSource: row.capture_source ?? "manual",
    sourceChatId: row.source_chat_id ?? null,
    contacts: (row.interaction_contacts ?? []).map((link) => ({
      id: link.contact_id,
      name: link.contacts?.name ?? "",
    })),
  };
}

/**
 * Reads and writes Interactions on behalf of the signed-in User. RLS enforces
 * ownership server-side. Creation goes through the `create_interaction` RPC so
 * the interaction row and its Contact links land in one transaction (the
 * deferred constraint trigger needs that atomicity to admit valid inserts).
 */
export class InteractionsClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(config: InteractionsClientConfig): InteractionsClient {
    return new InteractionsClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  async createInteraction(input: CreateInteractionInput): Promise<string> {
    const baseArgs = {
      p_time: input.time,
      p_kind: input.kind,
      p_notes: input.notes ?? null,
      p_status: input.status,
      p_contact_ids: input.contactIds,
    };
    // PostgREST disambiguates the two `create_interaction` overloads by the
    // named-parameter set: passing p_group_id selects the 6-arg group-mode
    // signature, omitting it keeps the original 5-arg 1:1 signature.
    const args =
      input.groupId !== undefined
        ? { ...baseArgs, p_group_id: input.groupId }
        : baseArgs;
    const { data, error } = await this.client.rpc("create_interaction", args);
    if (error) throw error;
    return data as string;
  }

  async markMissed(id: string): Promise<void> {
    const { error } = await this.client
      .from("interactions")
      .update({ status: "missed" })
      .eq("id", id);
    if (error) throw error;
  }

  /** Planned interactions whose time is `now` or later, oldest-first. */
  async listUpcomingPlanned(now: Date = new Date()): Promise<Interaction[]> {
    const { data, error } = await this.client
      .from("interactions")
      .select(SELECT_WITH_CONTACTS)
      .eq("status", "planned")
      .gte("time", now.toISOString())
      .order("time", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as InteractionRow[]).map(toInteraction);
  }

  /** Every interaction the User owns, oldest-first. Calendar tab consumes this. */
  async listAll(): Promise<Interaction[]> {
    const { data, error } = await this.client
      .from("interactions")
      .select(SELECT_WITH_CONTACTS)
      .order("time", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as InteractionRow[]).map(toInteraction);
  }

  async updateStatus(id: string, status: InteractionStatus): Promise<void> {
    const { error } = await this.client
      .from("interactions")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
  }

  async updateCategory(id: string, category: InteractionCategory): Promise<void> {
    const { error } = await this.client
      .from("interactions")
      .update({ category })
      .eq("id", id);
    if (error) throw error;
  }

  /**
   * Interactions involving a given Contact, most-recent-first. Drives the
   * history section on the Single Relationship view. The PostgREST `!inner`
   * filter on the embedded join table restricts parent interactions to those
   * with a matching link, and the `.eq("interaction_contacts.contact_id", …)`
   * is the conventional way to filter parent rows by an embedded column.
   */
  /**
   * Interactions logged in Group mode for a given Group, most-recent-first.
   * Only Group-mode Interactions (group_id set) appear here — 1:1
   * Interactions with member Contacts are intentionally excluded per the
   * Slice 6 brief / ADR-0004 ("Group-mode is explicit, never inferred from
   * member overlap").
   */
  async listForGroup(groupId: string): Promise<Interaction[]> {
    const { data, error } = await this.client
      .from("interactions")
      .select(SELECT_WITH_CONTACTS)
      .eq("group_id", groupId)
      .order("time", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as InteractionRow[]).map(toInteraction);
  }

  async listForContact(contactId: string): Promise<Interaction[]> {
    const { data, error } = await this.client
      .from("interactions")
      .select(
        "id, time, kind, category, notes, status, capture_source, source_chat_id, interaction_contacts!inner(contact_id, contacts(name))",
      )
      .eq("interaction_contacts.contact_id", contactId)
      .order("time", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as InteractionRow[]).map(toInteraction);
  }

  async getInteraction(id: string): Promise<Interaction> {
    const { data, error } = await this.client
      .from("interactions")
      .select(SELECT_WITH_CONTACTS)
      .eq("id", id)
      .single();
    if (error) throw error;
    return toInteraction(data as unknown as InteractionRow);
  }

  /**
   * Mutate an existing Interaction's time / kind / notes / status. Contact
   * link mutation is out of scope for this client — re-link by deleting and
   * re-creating, or extend with an explicit method once a UI pattern emerges
   * (the web Calendar's inline edit only touches the scalar fields in v1).
   */
  async updateInteraction(
    id: string,
    input: Partial<
      Pick<
        CreateInteractionInput,
        "time" | "kind" | "category" | "notes" | "status"
      >
    >,
  ): Promise<Interaction> {
    const patch: Record<string, unknown> = {};
    if (input.time !== undefined) patch.time = input.time;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.category !== undefined) patch.category = input.category;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.status !== undefined) patch.status = input.status;

    const { data, error } = await this.client
      .from("interactions")
      .update(patch)
      .eq("id", id)
      .select(SELECT_WITH_CONTACTS)
      .single();
    if (error) throw error;
    return toInteraction(data as unknown as InteractionRow);
  }

  async deleteInteraction(id: string): Promise<void> {
    const { error } = await this.client
      .from("interactions")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  /**
   * Interactions whose time falls within [from, to] (inclusive bounds, ISO
   * strings). Drives the web /calendar window query. Server-side sort is
   * `time` ascending so the UI can group consecutive same-day rows in order.
   */
  async listInRange(input: { from: string; to: string }): Promise<Interaction[]> {
    const { data, error } = await this.client
      .from("interactions")
      .select(SELECT_WITH_CONTACTS)
      .gte("time", input.from)
      .lte("time", input.to)
      .order("time", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as InteractionRow[]).map(toInteraction);
  }
}
