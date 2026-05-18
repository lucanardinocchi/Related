import {
  createClient,
  SupabaseClient,
} from "@supabase/supabase-js";

export type InteractionStatus = "planned" | "occurred" | "missed";

export interface InteractionContact {
  id: string;
  name: string;
}

export interface Interaction {
  id: string;
  time: string;
  kind: string;
  notes: string | null;
  status: InteractionStatus;
  contacts: InteractionContact[];
}

export interface CreateInteractionInput {
  time: string;
  kind: string;
  notes?: string | null;
  status: InteractionStatus;
  contactIds: string[];
}

export interface InteractionsClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface InteractionRow {
  id: string;
  time: string;
  kind: string;
  notes: string | null;
  status: InteractionStatus;
  interaction_contacts: {
    contact_id: string;
    contacts: { name: string } | null;
  }[];
}

const SELECT_WITH_CONTACTS =
  "id, time, kind, notes, status, interaction_contacts(contact_id, contacts(name))";

function toInteraction(row: InteractionRow): Interaction {
  return {
    id: row.id,
    time: row.time,
    kind: row.kind,
    notes: row.notes,
    status: row.status,
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
    const { data, error } = await this.client.rpc("create_interaction", {
      p_time: input.time,
      p_kind: input.kind,
      p_notes: input.notes ?? null,
      p_status: input.status,
      p_contact_ids: input.contactIds,
    });
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
}
