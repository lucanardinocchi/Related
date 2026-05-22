"use client";

import { Button } from "@/components/ui";

interface Props {
  connected: boolean;
  needsReconsent?: boolean;
  connectLabel: string;
  onConnect: () => void;
  onReconnect?: () => void;
  onDisconnect?: () => void;
  connectLoading?: boolean;
  disconnectLoading?: boolean;
  disabled?: boolean;
}

/**
 * Connected / expired / disconnected actions for Settings integration cards.
 */
export function IntegrationConnectionActions({
  connected,
  needsReconsent = false,
  connectLabel,
  onConnect,
  onReconnect,
  onDisconnect,
  connectLoading = false,
  disconnectLoading = false,
  disabled = false,
}: Props) {
  if (needsReconsent) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-danger" role="status">
          Connection expired — reconnect to restore access.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={connectLoading}
            disabled={disabled}
            onClick={() => void (onReconnect ?? onConnect)()}
          >
            Reconnect
          </Button>
          {onDisconnect ? (
            <Button
              variant="ghost"
              size="sm"
              loading={disconnectLoading}
              disabled={disabled}
              onClick={() => void onDisconnect()}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-fg-muted">
          <span aria-hidden="true">✓ </span>
          Connected
        </p>
        {onDisconnect ? (
          <Button
            variant="ghost"
            size="sm"
            loading={disconnectLoading}
            disabled={disabled}
            onClick={() => void onDisconnect()}
          >
            Disconnect
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={connectLoading}
      disabled={disabled}
      onClick={() => void onConnect()}
    >
      {connectLabel}
    </Button>
  );
}
