"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { HeartHandshake, ThumbsDown, ThumbsUp, User, Users } from "lucide-react";
import type { ValuesCharacter } from "@related/shared";
import { cn } from "@/lib/cn";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button, EmptyState, Mono } from "@/components/ui";
import {
  MIN_SWIPES_FOR_INFERENCE,
  ValuesConfirmPanel,
} from "./_ValuesConfirmPanel";

interface Props {
  characters: ValuesCharacter[];
  initialAlignments: Record<string, boolean>;
}

const PERSON_COLORS = [
  "#2383e2",
  "#0f7c4a",
  "#b06d00",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#c2410c",
  "#4f46e5",
];

const SWIPE_THRESHOLD = 96;
const EXIT_DISTANCE = 520;

function personColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function buildQueue(
  characters: ValuesCharacter[],
  alignments: Record<string, boolean>,
  includeReviewed: boolean,
): ValuesCharacter[] {
  const pool = includeReviewed
    ? characters
    : characters.filter((character) => alignments[character.id] === undefined);
  return shuffle(pool);
}

export function ValuesSwipeView({ characters, initialAlignments }: Props) {
  const [alignments, setAlignments] =
    useState<Record<string, boolean>>(initialAlignments);
  const [includeReviewed, setIncludeReviewed] = useState(false);
  const [queue, setQueue] = useState(() =>
    buildQueue(characters, initialAlignments, false),
  );
  const [saving, setSaving] = useState(false);

  const reviewedCount = useMemo(
    () =>
      characters.filter((character) => alignments[character.id] !== undefined)
        .length,
    [characters, alignments],
  );

  const alignedCount = useMemo(
    () =>
      characters.filter((character) => alignments[character.id] === true).length,
    [characters, alignments],
  );

  const restart = useCallback(
    (withReviewed: boolean) => {
      setIncludeReviewed(withReviewed);
      setQueue(buildQueue(characters, alignments, withReviewed));
    },
    [characters, alignments],
  );

  const advance = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const recordSwipe = useCallback(
    async (character: ValuesCharacter, aligned: boolean) => {
      setAlignments((prev) => ({
        ...prev,
        [character.id]: aligned,
      }));
      advance();

      setSaving(true);
      try {
        const { valuesAlignment } = getBrowserDeps();
        await valuesAlignment.upsertAlignment(character.id, aligned);
      } catch {
        setAlignments((prev) => {
          const next = { ...prev };
          delete next[character.id];
          return next;
        });
        setQueue((prev) => [character, ...prev]);
      } finally {
        setSaving(false);
      }
    },
    [advance],
  );

  const current = queue[0] ?? null;
  const next = queue[1] ?? null;

  if (characters.length === 0) {
    return (
      <EmptyState
        icon={<Users size={28} />}
        title="No characters to review"
        description="The values roster is empty."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
              Reviewed
            </div>
            <div className="mt-1 font-[family-name:var(--font-jetbrains-mono)] text-[20px] tabular-nums">
              <Mono>
                {reviewedCount}/{characters.length}
              </Mono>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
              Aligned
            </div>
            <div className="mt-1 font-[family-name:var(--font-jetbrains-mono)] text-[20px] tabular-nums">
              <Mono>{alignedCount}</Mono>
            </div>
          </div>
        </div>
        {reviewedCount > 0 && !current && (
          <Button variant="secondary" size="sm" onClick={() => restart(true)}>
            Review again
          </Button>
        )}
      </div>

      {reviewedCount >= MIN_SWIPES_FOR_INFERENCE && (
        <ValuesConfirmPanel alignments={alignments} characters={characters} />
      )}

      <div className="relative mx-auto h-[420px] w-full max-w-md">
        {next && (
          <div
            aria-hidden
            className="absolute inset-x-4 top-3 bottom-8 scale-[0.96] rounded-2xl border border-border bg-surface opacity-60"
          />
        )}

        {current ? (
          <SwipeCard
            key={current.id}
            character={current}
            disabled={saving}
            onSwipe={(aligned) => void recordSwipe(current, aligned)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyState
              icon={<HeartHandshake size={28} />}
              title={
                reviewedCount === characters.length
                  ? "All caught up"
                  : "Nothing left in this pass"
              }
              description={
                reviewedCount === characters.length
                  ? "You've reviewed everyone. Run through again or discover your values above."
                  : "Start a new pass to revisit characters you've already reviewed."
              }
              action={
                <Button variant="primary" onClick={() => restart(true)}>
                  Review again
                </Button>
              }
            />
          </div>
        )}
      </div>

      {current && (
        <div className="mx-auto flex w-full max-w-md items-center justify-center gap-4">
          <Button
            variant="secondary"
            size="md"
            aria-label="Doesn't align"
            disabled={saving}
            leading={<ThumbsDown size={16} />}
            onClick={() => void recordSwipe(current, false)}
          >
            Doesn&apos;t align
          </Button>
          <Button
            variant="primary"
            size="md"
            aria-label="Aligns"
            disabled={saving}
            leading={<ThumbsUp size={16} />}
            onClick={() => void recordSwipe(current, true)}
          >
            Aligns
          </Button>
        </div>
      )}

      {includeReviewed && current && (
        <p className="text-center text-[13px] text-fg-subtle">
          Review mode — swiping updates your saved answer.
        </p>
      )}
    </div>
  );
}

function SwipeCard({
  character,
  disabled,
  onSwipe,
}: {
  character: ValuesCharacter;
  disabled: boolean;
  onSwipe: (aligned: boolean) => void;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const color = personColor(character.name);

  const resetDrag = () => {
    startRef.current = null;
    setDragging(false);
  };

  const finishSwipe = (direction: "left" | "right") => {
    setExiting(direction);
    setOffset({
      x: direction === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE,
      y: -24,
    });
    window.setTimeout(() => onSwipe(direction === "right"), 220);
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
      y: (event.clientY - startRef.current.y) * 0.35,
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

  const rotate = offset.x * 0.04;
  const alignOpacity = Math.min(Math.max(offset.x / SWIPE_THRESHOLD, 0), 1);
  const misalignOpacity = Math.min(Math.max(-offset.x / SWIPE_THRESHOLD, 0), 1);

  return (
    <div
      className={cn(
        "absolute inset-0 touch-none select-none",
        exiting ? "transition-transform duration-200 ease-out" : dragging ? "" : "transition-transform duration-150",
      )}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotate}deg)`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="flex h-full flex-col rounded-2xl border border-border bg-surface shadow-[0_20px_60px_-24px_rgba(0,0,0,0.35)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-3 rounded-xl border-2 border-success/70 bg-success/10 opacity-0"
          style={{ opacity: alignOpacity }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-3 rounded-xl border-2 border-danger/70 bg-danger/10 opacity-0"
          style={{ opacity: misalignOpacity }}
        />

        <div className="flex flex-1 flex-col items-center justify-center px-8 py-10 text-center">
          <div
            className="mb-5 flex h-24 w-24 items-center justify-center rounded-full text-[28px] font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {initials(character.name) || <User size={32} />}
          </div>
          <h2 className="text-[28px] font-semibold tracking-tight text-fg">
            {character.name}
          </h2>
          <p className="mt-2 text-[14px] text-fg-muted">{character.source}</p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            {character.values.map((value) => (
              <li
                key={value}
                className="rounded-full border border-divider bg-hover px-3 py-1 text-[13px] text-fg"
              >
                {value}
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-xs text-[14px] leading-[22px] text-fg-muted">
            Do their values align with who you want to be?
          </p>
        </div>

        <div className="border-t border-divider px-6 py-4 text-center text-[13px] text-fg-subtle">
          Swipe right to align · left if not
        </div>
      </div>
    </div>
  );
}
