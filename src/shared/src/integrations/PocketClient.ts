import type { SupabaseClient } from "@supabase/supabase-js";

export interface PocketConnectResult {
  status: "ok" | "error";
  accountDisplayName?: string;
  connectedAt?: string;
  error?: string;
  message?: string;
}

export interface PocketSyncSummary {
  status: "ok" | "error";
  imported?: number;
  extracted?: number;
  skippedAlreadyImported?: number;
  ambiguitiesCreated?: number;
  ambiguitiesPending?: number;
  errors?: string[];
  error?: string;
}

export interface PocketSpeakerAmbiguity {
  id: string;
  recordingId: string;
  recordingTitle: string | null;
  recordingCreatedAt: string | null;
  speakers: string[];
  createdAt: string;
}

export interface PocketIntegrationStatus {
  connected: boolean;
  accountDisplayName: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  importCount: number;
  hasWebhookSecret: boolean;
  pendingAmbiguityCount: number;
}

interface AmbiguityRow {
  id: string;
  recording_id: string;
  recording_title: string | null;
  recording_created_at: string | null;
  speakers: string[];
  created_at: string;
}

interface IntegrationRow {
  account_display_name: string;
  connected_at: string;
  last_synced_at: string | null;
  webhook_secret: string | null;
}

/**
 * Client for Pocket AI voice recorder integration — connect, sync transcripts,
 * resolve speaker ambiguities. Imported recordings feed the Extraction Pass
 * via hidden pocket-sourced Chats (not shown in the agent rail).
 */
export class PocketClient {
  constructor(private readonly client: SupabaseClient) {}

  async connect(input: {
    apiKey: string;
    accountDisplayName?: string;
    webhookSecret?: string;
  }): Promise<PocketConnectResult> {
    const { data, error } = await this.client.functions.invoke("pocket-connect", {
      body: input,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "pocket-connect failed";
      throw new Error(errMsg);
    }
    return (data ?? { status: "error" }) as PocketConnectResult;
  }

  async updateWebhookSecret(webhookSecret: string): Promise<void> {
    const { data, error } = await this.client.functions.invoke("pocket-connect", {
      body: { action: "updateWebhook", webhookSecret },
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "pocket-webhook update failed";
      throw new Error(errMsg);
    }
    if ((data as { status?: string })?.status !== "ok") {
      throw new Error("Failed to save webhook secret");
    }
  }

  async disconnect(): Promise<void> {
    const { data, error } = await this.client.functions.invoke("pocket-connect", {
      body: { action: "disconnect" },
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "pocket-disconnect failed";
      throw new Error(errMsg);
    }
    if ((data as { status?: string })?.status !== "ok") {
      throw new Error("Failed to disconnect Pocket");
    }
  }

  async sync(): Promise<PocketSyncSummary> {
    const { data, error } = await this.client.functions.invoke("pocket-sync", {
      body: {},
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "pocket-sync failed";
      throw new Error(errMsg);
    }
    return (data ?? { status: "error" }) as PocketSyncSummary;
  }

  async resolveSpeaker(input: {
    recordingId: string;
    speaker: string;
  }): Promise<{ chatId: string }> {
    const { data, error } = await this.client.functions.invoke("pocket-sync", {
      body: {
        action: "resolveSpeaker",
        recordingId: input.recordingId,
        speaker: input.speaker,
      },
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "pocket-resolve failed";
      throw new Error(errMsg);
    }
    const result = (data ?? {}) as { status?: string; chatId?: string; error?: string };
    if (result.status !== "ok" || !result.chatId) {
      throw new Error(result.error ?? "Failed to resolve speaker");
    }
    return { chatId: result.chatId };
  }

  async listPendingAmbiguities(): Promise<PocketSpeakerAmbiguity[]> {
    const { data, error } = await this.client
      .from("pocket_speaker_ambiguities")
      .select(
        "id, recording_id, recording_title, recording_created_at, speakers, created_at",
      )
      .is("resolved_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as AmbiguityRow[]).map((row) => ({
      id: row.id,
      recordingId: row.recording_id,
      recordingTitle: row.recording_title,
      recordingCreatedAt: row.recording_created_at,
      speakers: row.speakers,
      createdAt: row.created_at,
    }));
  }

  async getStatus(): Promise<PocketIntegrationStatus> {
    const [tokenRes, integrationRes, importRes, ambiguityRes] = await Promise.all([
      this.client
        .from("user_provider_tokens")
        .select("provider")
        .eq("provider", "pocket")
        .maybeSingle(),
      this.client
        .from("pocket_integration")
        .select(
          "account_display_name, connected_at, last_synced_at, webhook_secret",
        )
        .maybeSingle(),
      this.client
        .from("pocket_imports")
        .select("recording_id", { count: "exact", head: true }),
      this.client
        .from("pocket_speaker_ambiguities")
        .select("id", { count: "exact", head: true })
        .is("resolved_at", null),
    ]);

    const integration = integrationRes.data as IntegrationRow | null;
    return {
      connected: Boolean(tokenRes.data && integration),
      accountDisplayName: integration?.account_display_name ?? null,
      connectedAt: integration?.connected_at ?? null,
      lastSyncedAt: integration?.last_synced_at ?? null,
      importCount: importRes.count ?? 0,
      hasWebhookSecret: Boolean(integration?.webhook_secret),
      pendingAmbiguityCount: ambiguityRes.count ?? 0,
    };
  }
}

export function tokenHasPocketAccess(
  token: { provider: string } | null | undefined,
): boolean {
  return token?.provider === "pocket";
}
