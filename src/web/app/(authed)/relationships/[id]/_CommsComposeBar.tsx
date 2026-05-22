"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button, Select, Textarea } from "@/components/ui";
import { CommsPlatformIcon } from "./_commsIcons";

export type ComposePlatform =
  | "instagram"
  | "whatsapp"
  | "x"
  | "tiktok"
  | "email"
  | "imessage";

export interface AvailablePlatform {
  platform: ComposePlatform;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface Props {
  availablePlatforms: AvailablePlatform[];
  onSend: (platform: ComposePlatform, text: string) => Promise<void>;
  defaultPlatform?: ComposePlatform;
  placeholder?: string;
}

function pickDefault(
  available: AvailablePlatform[],
  preferred?: ComposePlatform,
): ComposePlatform | null {
  if (available.length === 0) return null;
  if (preferred) {
    const found = available.find(
      (p) => p.platform === preferred && !p.disabled,
    );
    if (found) return found.platform;
  }
  const first = available.find((p) => !p.disabled) ?? available[0]!;
  return first.platform;
}

export function CommsComposeBar({
  availablePlatforms,
  onSend,
  defaultPlatform,
  placeholder,
}: Props) {
  const [platform, setPlatform] = useState<ComposePlatform | null>(() =>
    pickDefault(availablePlatforms, defaultPlatform),
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlatform((current) => {
      if (current && availablePlatforms.some((p) => p.platform === current)) {
        return current;
      }
      return pickDefault(availablePlatforms, defaultPlatform);
    });
  }, [availablePlatforms, defaultPlatform]);

  const selected = availablePlatforms.find((p) => p.platform === platform);
  const trimmed = text.trim();
  const disabledReason = selected?.disabled
    ? selected.disabledReason ?? "Not available for this contact yet."
    : null;
  const canSend =
    !!platform && !!selected && !selected.disabled && trimmed.length > 0 && !sending;

  async function handleSend() {
    if (!canSend || !platform) return;
    setSending(true);
    setError(null);
    try {
      await onSend(platform, trimmed);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  if (availablePlatforms.length === 0) return null;

  return (
    <div className="mt-4 space-y-2 rounded-md border border-border bg-surface p-3">
      <Textarea
        placeholder={placeholder ?? "Write a message…"}
        value={text}
        rows={3}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-fg-muted">
            {platform ? <CommsPlatformIcon platform={platform} /> : null}
          </span>
          <div className="min-w-[8rem] max-w-[14rem]">
            <Select
              value={platform ?? ""}
              onChange={(e) =>
                setPlatform(e.target.value as ComposePlatform)
              }
              aria-label="Send via"
            >
              {availablePlatforms.map((p) => (
                <option
                  key={p.platform}
                  value={p.platform}
                  disabled={p.disabled}
                >
                  {p.label}
                  {p.disabled && p.disabledReason ? ` — ${p.disabledReason}` : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          leading={<Send size={14} />}
          loading={sending}
          disabled={!canSend}
          onClick={() => void handleSend()}
        >
          Send
        </Button>
      </div>
      {disabledReason ? (
        <p className="text-[12px] text-fg-subtle">{disabledReason}</p>
      ) : null}
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
