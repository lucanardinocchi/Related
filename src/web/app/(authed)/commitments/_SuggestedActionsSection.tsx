"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import type { PendingCandidateForUser } from "@related/shared";
import { resolveSendMessageRecipients } from "@related/shared";
import { cn } from "@/lib/cn";
import { getBrowserDeps } from "@/lib/deps/client";
import { Card, EmptyState } from "@/components/ui";

export interface CandidateRelationshipContext {
  id: string;
  label: string;
  phone: string | null;
  email: string | null;
}

interface Props {
  initialPending: PendingCandidateForUser[];
  relationshipsById: Record<string, CandidateRelationshipContext>;
  /** Called after accept when a new commitment may have been created. */
  onCommitmentsChanged?: () => void | Promise<void>;
  className?: string;
}

const SWIPE_THRESHOLD = 88;
const EXIT_DISTANCE = 420;

const ACTION_LABELS: Record<string, string> = {
  OpenThread: "New commitment",
  SendMessage: "Send message",
  ScheduleInteraction: "Schedule time",
  LogInteraction: "Log interaction",
  CloseThread: "Close thread",
  UpdateRoleOrCadence: "Update relationship",
  DoNothing: "No action",
};

function actionLabel(type: string): string {
  return ACTION_LABELS[type] ?? type;
}

function payloadPreview(
  type: string,
  payload: unknown,
): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const p = payload as Record<string, unknown>;
  if (type === "OpenThread" && typeof p.description === "string") {
    return p.description;
  }
  if (type === "SendMessage" && typeof p.body === "string") {
    return p.body;
  }
  if (
    (type === "ScheduleInteraction" || type === "LogInteraction") &&
    typeof p.kind === "string"
  ) {
    return p.kind;
  }
  if (typeof p.description === "string") return p.description;
  return null;
}

export function SuggestedActionsSection({
  initialPending,
  relationshipsById,
  onCommitmentsChanged,
  className,
}: Props) {
  const [pending, setPending] = useState(initialPending);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPending(initialPending);
  }, [initialPending]);

  const current = pending[0] ?? null;

  const resolve = useCallback(
    async (item: PendingCandidateForUser, intent: "accept" | "decline") => {
      const { agentService } = getBrowserDeps();
      const { action } = item;
      const relationship = relationshipsById[item.relationshipId];

      let userEdits: { payload: Record<string, unknown> } | undefined;
      if (intent === "accept" && action.type === "SendMessage") {
        const channel = (action.payload as { channel?: string })?.channel;
        const resolved = resolveSendMessageRecipients(
          relationship ?? { phone: null, email: null },
          channel,
        );
        userEdits = { payload: { to: resolved } };
      }

      setError(null);
      setBusy(true);
      try {
        if (intent === "accept") {
          await agentService.acceptAction({
            candidateSetId: item.candidateSetId,
            action,
            userEdits,
          });
          await onCommitmentsChanged?.();
        } else {
          await agentService.declineAction({
            candidateSetId: item.candidateSetId,
            action,
          });
        }
        setPending((prev) => prev.filter((p) => p.action.id !== action.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      } finally {
        setBusy(false);
      }
    },
    [onCommitmentsChanged, relationshipsById],
  );

  return (
    <aside
      className={cn(
        "flex w-full flex-col lg:w-[min(100%,340px)] lg:shrink-0",
        className,
      )}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-medium leading-[26px] tracking-[-0.005em] text-fg">
            Suggested actions
          </h2>
          <p className="mt-1 text-[13px] leading-[20px] text-fg-muted">
            Swipe right to add · left to dismiss
          </p>
        </div>
        {pending.length > 0 ? (
          <span className="text-[12px] tabular-nums text-fg-subtle">
            {pending.length} left
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 text-[13px] text-danger">{error}</p>
      ) : null}

      {current ? (
        <SuggestedActionSwipeStack
          items={pending}
          relationshipsById={relationshipsById}
          disabled={busy}
          onSwipeLeft={(item) => void resolve(item, "decline")}
          onSwipeRight={(item) => void resolve(item, "accept")}
        />
      ) : (
        <Card className="flex min-h-[280px] flex-col items-center justify-center border border-border bg-surface/60 p-6">
          <EmptyState
            icon={<Sparkles size={24} strokeWidth={1.5} />}
            title="Nothing to review"
            description="When ambient intelligence surfaces a candidate action, it will appear here."
          />
        </Card>
      )}
    </aside>
  );
}

function SuggestedActionSwipeStack({
  items,
  relationshipsById,
  disabled,
  onSwipeLeft,
  onSwipeRight,
}: {
  items: PendingCandidateForUser[];
  relationshipsById: Record<string, CandidateRelationshipContext>;
  disabled: boolean;
  onSwipeLeft: (item: PendingCandidateForUser) => void;
  onSwipeRight: (item: PendingCandidateForUser) => void;
}) {
  const current = items[0];
  const next = items[1];

  if (!current) return null;

  return (
    <div className="relative mx-auto h-[340px] w-full max-w-[340px]">
      {next ? (
        <div
          className="absolute inset-x-3 top-3 bottom-3 rounded-2xl border border-border bg-surface/50"
          aria-hidden
        />
      ) : null}
      <SuggestedActionSwipeCard
        key={current.action.id}
        item={current}
        relationshipLabel={
          relationshipsById[current.relationshipId]?.label ?? "Relationship"
        }
        disabled={disabled}
        onSwipeLeft={() => onSwipeLeft(current)}
        onSwipeRight={() => onSwipeRight(current)}
      />
      <div className="mt-4 flex items-center justify-center gap-6">
        <SwipeHint
          direction="left"
          label="Dismiss"
          disabled={disabled}
          onClick={() => onSwipeLeft(current)}
        />
        <SwipeHint
          direction="right"
          label="Add"
          disabled={disabled}
          onClick={() => onSwipeRight(current)}
        />
      </div>
    </div>
  );
}

function SwipeHint({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ArrowLeft : ArrowRight;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40",
        direction === "right"
          ? "border-success/30 text-success hover:bg-success/10"
          : "border-border text-fg-muted hover:bg-hover",
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function SuggestedActionSwipeCard({
  item,
  relationshipLabel,
  disabled,
  onSwipeLeft,
  onSwipeRight,
}: {
  item: PendingCandidateForUser;
  relationshipLabel: string;
  disabled: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const preview = payloadPreview(item.action.type, item.action.payload);
  const addOpacity = Math.min(Math.max(offset.x / SWIPE_THRESHOLD, 0), 1);
  const dismissOpacity = Math.min(Math.max(-offset.x / SWIPE_THRESHOLD, 0), 1);
  const rotate = offset.x * 0.035;

  const resetDrag = () => {
    startRef.current = null;
    setDragging(false);
  };

  const finishSwipe = (direction: "left" | "right") => {
    setExiting(direction);
    setOffset({
      x: direction === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE,
      y: direction === "left" ? 12 : -12,
    });
    window.setTimeout(() => {
      if (direction === "right") onSwipeRight();
      else onSwipeLeft();
    }, 200);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || exiting) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || !startRef.current || exiting) return;
    setOffset({
      x: event.clientX - startRef.current.x,
      y: (event.clientY - startRef.current.y) * 0.25,
    });
  };

  const onPointerUp = () => {
    if (!dragging || exiting) return;
    resetDrag();

    if (offset.x > SWIPE_THRESHOLD) {
      finishSwipe("right");
      return;
    }
    if (offset.x < -SWIPE_THRESHOLD) {
      finishSwipe("left");
      return;
    }
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      className={cn(
        "absolute inset-0 touch-none select-none",
        exiting
          ? "transition-transform duration-200 ease-out"
          : dragging
            ? ""
            : "transition-transform duration-150",
      )}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotate}deg)`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_48px_-24px_rgba(0,0,0,0.35)]">
        <div
          className="pointer-events-none absolute inset-0 bg-success/10 transition-opacity"
          style={{ opacity: addOpacity }}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-fg/5 transition-opacity"
          style={{ opacity: dismissOpacity }}
        />

        <div className="border-b border-divider px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
            {actionLabel(item.action.type)}
          </p>
          <Link
            href={`/relationships/${item.relationshipId}`}
            className="mt-1 block text-[15px] font-medium text-fg hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {relationshipLabel}
          </Link>
        </div>

        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          {preview ? (
            <p className="text-[14px] leading-[22px] text-fg">{preview}</p>
          ) : null}
          {item.action.why ? (
            <p className="text-[13px] leading-[20px] text-fg-muted">
              {item.action.why}
            </p>
          ) : null}
          <p className="mt-auto text-[11px] text-fg-subtle">
            {item.passMode} pass
          </p>
        </div>

        <div className="flex justify-between border-t border-divider px-4 py-2 text-[11px] font-medium uppercase tracking-[0.06em]">
          <span
            className="text-fg-muted transition-opacity"
            style={{ opacity: Math.max(0.35, dismissOpacity) }}
          >
            ← Dismiss
          </span>
          <span
            className="text-success transition-opacity"
            style={{ opacity: Math.max(0.35, addOpacity) }}
          >
            Add →
          </span>
        </div>
      </div>
    </div>
  );
}
