"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Plug } from "lucide-react";
import {
  buildMcpSetupPrompt,
  mcpServerUrlFromSupabaseUrl,
} from "@related/shared";
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

export function McpSection() {
  const [apiKey, setApiKey] = useState<{
    value: string;
    prefix: string;
    createdAt: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mcpServerUrl = useMemo(
    () => (SUPABASE_URL ? mcpServerUrlFromSupabaseUrl(SUPABASE_URL) : null),
    [],
  );

  const setupPrompt = useMemo(() => {
    if (!apiKey || !mcpServerUrl) return null;
    return buildMcpSetupPrompt({
      apiKey: apiKey.value,
      mcpServerUrl,
    });
  }, [apiKey, mcpServerUrl]);

  const generateKey = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const { mcp } = getBrowserDeps();
      const created = await mcp.createApiKey();
      setApiKey({
        value: created.apiKey,
        prefix: created.keyPrefix,
        createdAt: created.createdAt,
      });
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate MCP API key.");
    } finally {
      setGenerating(false);
    }
  }, [generating]);

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
    <div id="connect-mcp" className="scroll-mt-8">
    <Section title="Connect MCP" fixed>
      <div className="space-y-3">
        <Card>
          <div className="flex items-start gap-3">
            <Plug size={18} className="mt-0.5 shrink-0 text-fg-subtle" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-[14px] font-medium text-fg">
                  Related MCP
                </p>
                <p className="mt-0.5 text-[13px] text-fg-muted">
                  Connect Related to Claude, Cursor, or another MCP-compatible
                  AI tool. Generate an API key, copy the setup prompt, and
                  paste it into your AI assistant to wire up the connection.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="space-y-3">
            <div>
              <p className="text-[14px] font-medium text-fg">Setup prompt</p>
              <p className="mt-0.5 text-[13px] text-fg-muted">
                Generate a one-time API key, then paste the setup prompt into
                Claude Code, Cursor, or another AI coding tool on your machine.
              </p>
            </div>

            {apiKey && setupPrompt ? (
              <div className="space-y-3 rounded-md border border-border bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] uppercase tracking-wide text-fg-subtle">
                      API key
                    </p>
                    <p className="mt-1 font-mono text-[14px] font-medium text-fg">
                      {apiKey.prefix}
                    </p>
                    <p className="mt-1 text-[13px] text-fg-muted">
                      Created {formatDateTime(apiKey.createdAt)}. Shown once —
                      copy the setup prompt below before dismissing.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    leading={copied ? <Check size={14} /> : <Copy size={14} />}
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
                    rows={16}
                    className="mt-2 w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-fg"
                    onFocus={(event) => event.target.select()}
                  />
                  <p className="mt-2 text-[13px] text-fg-muted">
                    Open your AI tool, paste this prompt, and let it add Related
                    to your MCP servers. Restart the client when it asks.
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setApiKey(null);
                    setCopied(false);
                  }}
                >
                  Dismiss
                </Button>
              </div>
            ) : apiKey && !mcpServerUrl ? (
              <p className="text-[13px] text-danger" role="alert">
                Missing NEXT_PUBLIC_SUPABASE_URL — cannot build setup prompt.
              </p>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={generating}
                onClick={() => void generateKey()}
              >
                Generate setup prompt
              </Button>
            )}
          </div>
        </Card>

        {error ? (
          <p className="text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Section>
    </div>
  );
}
