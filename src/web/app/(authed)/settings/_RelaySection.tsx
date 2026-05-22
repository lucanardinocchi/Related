"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Laptop, RefreshCw } from "lucide-react";
import { buildRelaySetupPrompt, type RelayDevice } from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button, Card, Section } from "@/components/ui";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function formatDateTime(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "Never seen";
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  if (diffMs < 60_000) return "Just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDateTime(lastSeenAt);
}

export function RelaySection() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<RelayDevice[]>([]);
  const [pairingCode, setPairingCode] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setupPrompt = useMemo(() => {
    if (!pairingCode || !SUPABASE_URL) return null;
    return buildRelaySetupPrompt({
      pairingCode: pairingCode.code,
      supabaseUrl: SUPABASE_URL,
      expiresAt: pairingCode.expiresAt,
    });
  }, [pairingCode]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const { messages } = getBrowserDeps();
      const [relayOnline, relayDevices] = await Promise.all([
        messages.isRelayOnline(),
        messages.listRelayDevices(),
      ]);
      setOnline(relayOnline);
      setDevices(relayDevices);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load relay status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function generateCode() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const { messages } = getBrowserDeps();
      const code = await messages.createPairingCode();
      setPairingCode(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate pairing code.");
    } finally {
      setGenerating(false);
    }
  }

  async function copySetupPrompt() {
    if (!setupPrompt) return;
    try {
      await navigator.clipboard.writeText(setupPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <Section title="Mac Messages relay" fixed>
      <div className="space-y-3">
        <Card>
          <div className="flex items-start gap-3">
            <Laptop size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">
                  Relay status
                </p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Sync SMS and iMessage from your Mac into Related. The relay
                  must be running and paired for live send/receive.
                </p>
              </div>
              {loading ? (
                <p className="text-[13px] text-fg-muted">Checking relay…</p>
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block size-2 rounded-full ${
                      online ? "bg-success" : "bg-fg-subtle"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-[13px] text-fg-muted">
                    {online ? "Online" : "Offline"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    leading={<RefreshCw size={14} />}
                    onClick={() => {
                      setLoading(true);
                      void refresh();
                    }}
                  >
                    Refresh
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="space-y-3">
            <div>
              <p className="text-[14px] font-medium text-fg">Pair a Mac</p>
              <p className="mt-0.5 text-[13px] text-fg-muted">
                Generate a one-time code, then paste the setup prompt into
                Claude Code, Cursor, or another AI coding tool on your Mac.
              </p>
            </div>

            {pairingCode && setupPrompt ? (
              <div className="space-y-3 rounded-md border border-border bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] uppercase tracking-wide text-fg-subtle">
                      Pairing code
                    </p>
                    <p className="mt-1 font-mono text-[24px] font-semibold tracking-[0.2em] text-fg">
                      {pairingCode.code}
                    </p>
                    <p className="mt-1 text-[13px] text-fg-muted">
                      Expires {formatDateTime(pairingCode.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    leading={
                      copied ? <Check size={14} /> : <Copy size={14} />
                    }
                    onClick={() => void copySetupPrompt()}
                  >
                    {copied ? "Copied" : "Copy setup prompt"}
                  </Button>
                </div>

                <div>
                  <p className="text-[12px] uppercase tracking-wide text-fg-subtle">
                    AI setup prompt
                  </p>
                  <textarea
                    readOnly
                    value={setupPrompt}
                    rows={14}
                    className="mt-2 w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-fg"
                    onFocus={(event) => event.target.select()}
                  />
                  <p className="mt-2 text-[13px] text-fg-muted">
                    Open your AI tool on the Mac signed into Messages, paste
                    this prompt, and let it install imsg, pair the relay, and
                    start syncing.
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPairingCode(null);
                    setCopied(false);
                  }}
                >
                  Dismiss
                </Button>
              </div>
            ) : pairingCode && !SUPABASE_URL ? (
              <p className="text-[13px] text-danger" role="alert">
                Missing NEXT_PUBLIC_SUPABASE_URL — cannot build setup prompt.
              </p>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={generating}
                onClick={() => void generateCode()}
              >
                Generate pairing code
              </Button>
            )}
          </div>
        </Card>

        {devices.length > 0 ? (
          <Card>
            <div className="space-y-2">
              <p className="text-[14px] font-medium text-fg">Paired devices</p>
              <ul className="divide-y divide-divider">
                {devices.map((device) => (
                  <li
                    key={device.id}
                    className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="text-[13px] text-fg">{device.name}</span>
                    <span className="shrink-0 text-[12px] text-fg-subtle">
                      Last seen {formatRelativeSeen(device.lastSeenAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ) : null}

        {error ? (
          <p className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Section>
  );
}
