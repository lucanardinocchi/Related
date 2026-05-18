import {
  createClient,
  SupabaseClient,
} from "@supabase/supabase-js";

export type ThreadDirection = "me_owes_them" | "they_owe_me";

export interface OpenThread {
  id: string;
  description: string;
  direction: ThreadDirection;
  createdAt: string;
  closedAt: string | null;
  relationshipIds: string[];
}

export interface CreateOpenThreadInput {
  description: string;
  direction: ThreadDirection;
  relationshipIds: string[];
}

export interface ClosedPerDayBucket {
  date: string; // ISO date (YYYY-MM-DD)
  count: number;
}

export interface ClosedPerDayWindow {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface OpenThreadsClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface OpenThreadRow {
  id: string;
  description: string;
  direction: ThreadDirection;
  created_at: string;
  closed_at: string | null;
  open_thread_relationships: { relationship_id: string }[];
}

interface ClosedPerDayRow {
  day: string;
  count: number;
}

const SELECT_WITH_LINKS =
  "id, description, direction, created_at, closed_at, open_thread_relationships(relationship_id)";

function toOpenThread(row: OpenThreadRow): OpenThread {
  return {
    id: row.id,
    description: row.description,
    direction: row.direction,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    relationshipIds: (row.open_thread_relationships ?? []).map(
      (l) => l.relationship_id,
    ),
  };
}

/**
 * Reads and writes Open Threads on behalf of the signed-in User. RLS enforces
 * ownership server-side. Creation goes through the `create_open_thread` RPC
 * so the thread row and its join rows land in one transaction; closing is a
 * single `closed_at` write that propagates to all linked Relationships via
 * the many-to-many join (one Thread → many Relationships per ADR-0004).
 */
export class OpenThreadsClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(config: OpenThreadsClientConfig): OpenThreadsClient {
    return new OpenThreadsClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  async createOpenThread(input: CreateOpenThreadInput): Promise<string> {
    const { data, error } = await this.client.rpc("create_open_thread", {
      p_description: input.description,
      p_direction: input.direction,
      p_relationship_ids: input.relationshipIds,
    });
    if (error) throw error;
    return data as string;
  }

  async closeOpenThread(id: string): Promise<void> {
    const { error } = await this.client
      .from("open_threads")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
  }

  async listOpenForUser(): Promise<OpenThread[]> {
    const { data, error } = await this.client
      .from("open_threads")
      .select(SELECT_WITH_LINKS)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as OpenThreadRow[]).map(toOpenThread);
  }

  async listOpenForRelationship(relationshipId: string): Promise<OpenThread[]> {
    // Query through the join so we naturally filter by relationship_id and
    // still get the thread hydrated. Ordering is on the joined open_threads
    // row, oldest-first.
    const { data, error } = await this.client
      .from("open_thread_relationships")
      .select(
        `open_threads!inner(${SELECT_WITH_LINKS})`,
      )
      .eq("relationship_id", relationshipId)
      .order("open_threads(created_at)", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as { open_threads: OpenThreadRow }[])
      .map((r) => toOpenThread(r.open_threads));
  }

  async closedPerDay(window: ClosedPerDayWindow): Promise<ClosedPerDayBucket[]> {
    const { data, error } = await this.client.rpc("closed_threads_per_day", {
      p_from: window.from,
      p_to: window.to,
    });
    if (error) throw error;
    return ((data ?? []) as ClosedPerDayRow[]).map((r) => ({
      date: r.day,
      count: r.count,
    }));
  }
}
