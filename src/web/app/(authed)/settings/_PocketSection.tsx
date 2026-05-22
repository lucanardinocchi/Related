"use client";

import { useCallback, useEffect, useState } from "react";
import { Mic } from "lucide-react";
import type { PocketSpeakerAmbiguity } from "@related/shared";
import { Button, Card, Section } from "@/components/ui";
import { getBrowserDeps } from "@/lib/deps/client";

interface Props {
  webhookUrl: string | null;
  initialConnected: boolean;
  initialAccountDisplayName: string | null;
  initialConnectedAt: string | null;
  initialLastSyncedAt: string | null;
  initialImportCount: number;
  initialHasWebhookSecret: boolean;
  initialAmbiguities: PocketSpeakerAmbiguity[];
}

export function PocketSection({
  webhookUrl,
  initialConnected,
  initialAccountDisplayName,
  initialConnectedAt,
  initialLastSyncedAt,
  initialImportCount,
  initialHasWebhookSecret,
  initialAmbiguities,
}: Props) {
  const [connected, setConnected] = useState(initialConnected);
  const [accountDisplayName, setAccountDisplayName] = useState(
    initialAccountDisplayName,
  );
  const [connectedAt, setConnectedAt] = useState(initialConnectedAt);
  const [lastSyncedAt, setLastSyncedAt] = useState(initialLastSyncedAt);
  const [importCount, setImportCount] = useState(initialImportCount);
  const [hasWebhookSecret, setHasWebhookSecret] = useState(
    initialHasWebhookSecret,
  );
  const [ambiguities, setAmbiguities] =
    useState<PocketSpeakerAmbiguity[]>(initialAmbiguities);

  const [apiKey, setApiKey] = useState("");
  const [manualDisplayName, setManualDisplayName] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [needsDisplayName, setNeedsDisplayName] = useState(false);
  const [working, setWorking] = useState<
    "connect" | "sync" | "disconnect" | "webhook" | string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const { pocket } = getBrowserDeps();
    const status = await pocket.getStatus();
    setConnected(status.connected);
    setAccountDisplayName(status.accountDisplayName);
    setConnectedAt(status.connectedAt);
    setLastSyncedAt(status.lastSyncedAt);
    setImportCount(status.importCount);
    setHasWebhookSecret(status.hasWebhookSecret);
    const pending = await pocket.listPendingAmbiguities();
    setAmbiguities(pending);
  }, []);

  useEffect(() => {
    if (!connected) return;
    void refreshStatus();
  }, [connected, refreshStatus]);

  const connect = async () => {
    setWorking("connect");
    setError(null);
    setSyncMessage(null);
    try {
      const { pocket } = getBrowserDeps();
      const result = await pocket.connect({
        apiKey: apiKey.trim(),
        accountDisplayName: manualDisplayName.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
      });
      if (result.status !== "ok") {
        if (result.error === "could_not_resolve_account_name") {
          setNeedsDisplayName(true);
          setError(
            result.message ??
              "Enter the name Pocket uses as your speaker label in recordings.",
          );
          return;
        }
        setError(result.error ?? result.message ?? "Failed to connect Pocket");
        return;
      }
      setConnected(true);
      setAccountDisplayName(result.accountDisplayName ?? null);
      setConnectedAt(result.connectedAt ?? null);
      setHasWebhookSecret(Boolean(webhookSecret.trim()));
      setApiKey("");
      setManualDisplayName("");
      setNeedsDisplayName(false);

      setWorking("sync");
      const sync = await pocket.sync();
      if (sync.status === "ok") {
        setSyncMessage(formatSyncSummary(sync));
        await refreshStatus();
      } else {
        setError(sync.error ?? "Initial sync failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(null);
    }
  };

  const saveWebhookSecret = async () => {
    setWorking("webhook");
    setError(null);
    try {
      const { pocket } = getBrowserDeps();
      await pocket.updateWebhookSecret(webhookSecret.trim());
      setHasWebhookSecret(true);
      setWebhookSecret("");
      setSyncMessage("Webhook signing secret saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(null);
    }
  };

  const syncNow = async () => {
    setWorking("sync");
    setError(null);
    setSyncMessage(null);
    try {
      const { pocket } = getBrowserDeps();
      const sync = await pocket.sync();
      if (sync.status !== "ok") {
        setError(sync.error ?? "Sync failed");
        return;
      }
      setSyncMessage(formatSyncSummary(sync));
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(null);
    }
  };

  const disconnect = async () => {
    setWorking("disconnect");
    setError(null);
    setSyncMessage(null);
    try {
      const { pocket } = getBrowserDeps();
      await pocket.disconnect();
      setConnected(false);
      setAccountDisplayName(null);
      setConnectedAt(null);
      setLastSyncedAt(null);
      setImportCount(0);
      setHasWebhookSecret(false);
      setAmbiguities([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(null);
    }
  };

  const resolveAmbiguity = async (recordingId: string, speaker: string) => {
    setWorking(recordingId);
    setError(null);
    try {
      const { pocket } = getBrowserDeps();
      await pocket.resolveSpeaker({ recordingId, speaker });
      await refreshStatus();
      setSyncMessage(`Imported recording after resolving speaker "${speaker}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(null);
    }
  };

  const sectionTitle =
    ambiguities.length > 0
      ? `Pocket voice recorder (${ambiguities.length} speaker ${ambiguities.length === 1 ? "ambiguity" : "ambiguities"})`
      : "Pocket voice recorder";

  return (
    <Section title={sectionTitle}>
      <Card>
        <div className="flex items-start gap-3">
          <Mic size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-[14px] font-medium text-fg">Pocket AI</p>
              <p className="mt-0.5 text-[13px] text-fg-muted">
                New Pocket transcriptions are imported automatically 15 minutes
                after transcription completes, then run through the Extraction
                Pass. Imported recordings do not appear in the agent chat rail.
              </p>
            </div>

            {connected ? (
              <div className="space-y-3 text-[13px] text-fg-muted">
                <div className="space-y-2">
                  <p>
                    <span aria-hidden="true">✓ </span>
                    Connected as{" "}
                    <span className="font-medium text-fg">
                      {accountDisplayName ?? "Unknown"}
                    </span>
                  </p>
                  {connectedAt ? <p>Connected {formatWhen(connectedAt)}</p> : null}
                  {lastSyncedAt ? (
                    <p>Last synced {formatWhen(lastSyncedAt)}</p>
                  ) : null}
                  <p>
                    {importCount} recording{importCount === 1 ? "" : "s"}{" "}
                    imported
                  </p>
                </div>

                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="font-medium text-fg">Automatic import webhook</p>
                  <p>
                    In Pocket → Integrations, add a personal webhook for{" "}
                    <code className="text-[12px]">transcription.completed</code>
                    :
                  </p>
                  {webhookUrl ? (
                    <code className="block break-all rounded bg-bg px-2 py-1 text-[12px] text-fg">
                      {webhookUrl}
                    </code>
                  ) : (
                    <p>Set NEXT_PUBLIC_SUPABASE_URL to show the webhook URL.</p>
                  )}
                  <label className="block">
                    Webhook signing secret
                    <input
                      type="password"
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder={hasWebhookSecret ? "Saved — paste to rotate" : "From Pocket webhook setup"}
                      className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-fg"
                      autoComplete="off"
                    />
                  </label>
                  {hasWebhookSecret ? (
                    <p>
                      <span aria-hidden="true">✓ </span>
                      Signing secret on file
                    </p>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={working === "webhook"}
                    disabled={!webhookSecret.trim() || working !== null}
                    onClick={() => void saveWebhookSecret()}
                  >
                    Save webhook secret
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={working === "sync"}
                    disabled={working !== null}
                    onClick={() => void syncNow()}
                  >
                    Sync now (backfill)
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={working === "disconnect"}
                    disabled={working !== null}
                    onClick={() => void disconnect()}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-[13px] text-fg-muted">
                  Pocket API key
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="pk_..."
                    className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-fg"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-[13px] text-fg-muted">
                  Webhook signing secret (from Pocket after adding webhook)
                  <input
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="Optional at connect — required for auto-import"
                    className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-fg"
                    autoComplete="off"
                  />
                </label>
                {(needsDisplayName || manualDisplayName) && (
                  <label className="block text-[13px] text-fg-muted">
                    Your name in Pocket transcripts
                    <input
                      type="text"
                      value={manualDisplayName}
                      onChange={(e) => setManualDisplayName(e.target.value)}
                      placeholder="Luca Nardinocchi"
                      className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-fg"
                    />
                  </label>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  loading={working === "connect" || working === "sync"}
                  disabled={!apiKey.trim() || working !== null}
                  onClick={() => void connect()}
                >
                  Connect Pocket
                </Button>
              </div>
            )}

            {syncMessage ? (
              <p className="text-[13px] text-fg-muted">{syncMessage}</p>
            ) : null}
            {error ? (
              <p className="text-[13px] text-danger">{error}</p>
            ) : null}

            {connected && ambiguities.length > 0 ? (
              <div
                id="pocket-speaker-ambiguities"
                className="space-y-3 border-t border-border pt-3"
              >
                <p className="text-[14px] font-medium text-fg">
                  Speaker label ambiguities — resolve here
                </p>
                <p className="text-[13px] text-fg-muted">
                  These recordings could not be matched to your Pocket account
                  name ({accountDisplayName}). Until you pick your speaker
                  label, they will not update User Context. Choose which speaker
                  is you for each recording below.
                </p>
                <ul className="space-y-3">
                  {ambiguities.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border border-border p-3"
                    >
                      <p className="text-[14px] font-medium text-fg">
                        {item.recordingTitle ?? "Untitled recording"}
                      </p>
                      {item.recordingCreatedAt ? (
                        <p className="mt-0.5 text-[12px] text-fg-muted">
                          {formatWhen(item.recordingCreatedAt)}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[13px] text-fg-muted">
                        Speakers: {item.speakers.join(", ")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.speakers.map((speaker) => (
                          <Button
                            key={speaker}
                            variant="secondary"
                            size="sm"
                            loading={working === item.recordingId}
                            disabled={working !== null}
                            onClick={() =>
                              void resolveAmbiguity(item.recordingId, speaker)
                            }
                          >
                            I am {speaker}
                          </Button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </Section>
  );
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatSyncSummary(sync: {
  imported?: number;
  extracted?: number;
  skippedAlreadyImported?: number;
  ambiguitiesCreated?: number;
  ambiguitiesPending?: number;
  errors?: string[];
}): string {
  const parts = [
    `${sync.imported ?? 0} imported`,
    `${sync.skippedAlreadyImported ?? 0} already imported`,
  ];
  if ((sync.ambiguitiesCreated ?? 0) > 0) {
    parts.push(`${sync.ambiguitiesCreated} need speaker resolution below`);
  }
  if ((sync.errors?.length ?? 0) > 0) {
    parts.push(`${sync.errors!.length} errors`);
  }
  return `Sync complete: ${parts.join(", ")}.`;
}
