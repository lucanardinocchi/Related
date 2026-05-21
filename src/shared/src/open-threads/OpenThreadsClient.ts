import {
  createClient,
  SupabaseClient,
} from "@supabase/supabase-js";

export type ThreadDirection = "me_owes_them" | "they_owe_me";

/**
 * Whether a commitment originated from the other person asking, or the
 * User deciding themselves. Meaningful only on `me_owes_them` threads —
 * null elsewhere. See src/shared/CONTEXT.md → Open Thread.
 */
export type CommitmentOrigin = "asked_of_me" | "self_led";

/**
 * Whether the User has yet told the other person about a commitment.
 * Defaults to `not_communicated` — the User flips it to `confirmed` only
 * when they've explicitly communicated. See src/shared/CONTEXT.md → Open
 * Thread.
 */
export type CommitmentCommunicationStatus = "not_communicated" | "confirmed";

export interface OpenThread {
  id: string;
  description: string;
  direction: ThreadDirection;
  origin: CommitmentOrigin | null;
  communicationStatus: CommitmentCommunicationStatus;
  createdAt: string;
  closedAt: string | null;
  relationshipIds: string[];
}

export interface CreateOpenThreadInput {
  description: string;
  direction: ThreadDirection;
  relationshipIds: string[];
}

/**
 * Commitments-view filters per ADR-0008 / src/shared/CONTEXT.md. Omitting a
 * field means "no filter on that axis"; the underlying query is always
 * scoped to `direction = me_owes_them` and `closed_at IS NULL`.
 */
export interface ListCommitmentsFilter {
  origin?: CommitmentOrigin;
  communicationStatus?: CommitmentCommunicationStatus;
}

export interface SetCommitmentMetaInput {
  origin?: CommitmentOrigin | null;
  communicationStatus?: CommitmentCommunicationStatus;
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
  origin: CommitmentOrigin | null;
  communication_status: CommitmentCommunicationStatus;
  created_at: string;
  closed_at: string | null;
  open_thread_relationships: { relationship_id: string }[];
}

interface ClosedPerDayRow {
  day: string;
  count: number;
}

const SELECT_WITH_LINKS =
  "id, description, direction, origin, communication_status, created_at, closed_at, open_thread_relationships(relationship_id)";

function toOpenThread(row: OpenThreadRow): OpenThread {
  return {
    id: row.id,
    description: row.description,
    direction: row.direction,
    origin: row.origin,
    communicationStatus: row.communication_status,
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
 *
 * Per ADR-0008, Open Thread also carries the **Commitment** axes
 * (`origin`, `communicationStatus`) used by the web /commitments view.
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

  /**
   * List threads that are currently open (closed_at IS NULL) for the
   * signed-in User. Prior to ADR-0008 this method did NOT filter on
   * closed_at — that was a latent bug masked by callers that closed
   * threads infrequently. Now it does.
   */
  async listOpenForUser(): Promise<OpenThread[]> {
    const { data, error } = await this.client
      .from("open_threads")
      .select(SELECT_WITH_LINKS)
      .is("closed_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as OpenThreadRow[]).map(toOpenThread);
  }

  async listOpenForRelationship(relationshipId: string): Promise<OpenThread[]> {
    // Query through the join so we naturally filter by relationship_id and
    // still get the thread hydrated. Ordering is on the joined open_threads
    // row, oldest-first. Filters `closed_at IS NULL` on the joined row so
    // the "open threads" naming matches behaviour (fixed in ADR-0008).
    const { data, error } = await this.client
      .from("open_thread_relationships")
      .select(
        `open_threads!inner(${SELECT_WITH_LINKS})`,
      )
      .eq("relationship_id", relationshipId)
      .is("open_threads.closed_at", null)
      .order("open_threads(created_at)", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as { open_threads: OpenThreadRow }[])
      .map((r) => toOpenThread(r.open_threads));
  }

  /**
   * The web /commitments page reads through this method. Always scoped to
   * `direction = me_owes_them` (Commitments are User-owed by definition)
   * and `closed_at IS NULL`. Optional axis filters compose with AND.
   */
  async listCommitmentsForUser(
    filter: ListCommitmentsFilter = {},
  ): Promise<OpenThread[]> {
    let query = this.client
      .from("open_threads")
      .select(SELECT_WITH_LINKS)
      .eq("direction", "me_owes_them")
      .is("closed_at", null);

    if (filter.origin !== undefined) {
      query = query.eq("origin", filter.origin);
    }
    if (filter.communicationStatus !== undefined) {
      query = query.eq("communication_status", filter.communicationStatus);
    }

    const { data, error } = await query.order("created_at", {
      ascending: true,
    });
    if (error) throw error;
    return ((data ?? []) as unknown as OpenThreadRow[]).map(toOpenThread);
  }

  /**
   * Update the Commitment axes on an existing Open Thread. The DB enforces
   * the value enums via CHECK constraints; this client lets callers pass
   * `origin: null` to clear it (e.g. when re-classifying a thread away
   * from a Commitment).
   */
  async setCommitmentMeta(
    id: string,
    input: SetCommitmentMetaInput,
  ): Promise<OpenThread> {
    const patch: Record<string, unknown> = {};
    if (input.origin !== undefined) patch.origin = input.origin;
    if (input.communicationStatus !== undefined) {
      patch.communication_status = input.communicationStatus;
    }

    const { data, error } = await this.client
      .from("open_threads")
      .update(patch)
      .eq("id", id)
      .select(SELECT_WITH_LINKS)
      .single();
    if (error) throw error;
    return toOpenThread(data as unknown as OpenThreadRow);
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
