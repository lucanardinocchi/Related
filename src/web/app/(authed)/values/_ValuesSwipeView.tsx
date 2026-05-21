"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { ArrowRight, HeartHandshake, HelpCircle, ThumbsDown, ThumbsUp, Users } from "lucide-react";
import type { ValuesCharacter } from "@related/shared";
import { MIN_ALIGNED_FOR_RANKING } from "@related/shared";
import { cn } from "@/lib/cn";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button, Card, EmptyState } from "@/components/ui";

interface Props {
  characters: ValuesCharacter[];
  initialAlignments: Record<string, boolean>;
}

const SWIPE_THRESHOLD = 96;
const EXIT_DISTANCE = 520;

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

  const alignedCount = useMemo(
    () =>
      characters.filter((character) => alignments[character.id] === true).length,
    [characters, alignments],
  );

  const reviewedCount = useMemo(
    () =>
      characters.filter((character) => alignments[character.id] !== undefined)
        .length,
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

  const recordDontKnow = useCallback(
    (character: ValuesCharacter) => {
      advance();
    },
    [advance],
  );

  const current = queue[0] ?? null;
  const next = queue[1] ?? null;
  const canRank = alignedCount >= MIN_ALIGNED_FOR_RANKING;

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
      {canRank && (
        <Card className="border border-border/60 bg-surface/80">
          <p className="text-[14px] leading-[22px] text-fg-muted">
            You&apos;ve aligned with {alignedCount} characters. Rank them from
            who resonates most to least.
          </p>
          <Link href="/values/rank" className="mt-4 inline-block">
            <Button variant="primary" size="sm" trailing={<ArrowRight size={14} />}>
              Rank your alignments
            </Button>
          </Link>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-4">
        {reviewedCount > 0 && !current && (
          <Button variant="secondary" size="sm" onClick={() => restart(true)}>
            Review again
          </Button>
        )}
      </div>

      <div className="relative mx-auto h-[min(72vh,640px)] w-full max-w-sm">
        {next && (
          <div
            aria-hidden
            className="absolute inset-x-3 top-3 bottom-6 scale-[0.96] overflow-hidden rounded-3xl border border-border bg-surface opacity-50"
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
                  ? canRank
                    ? "Rank your alignments above, or run through again."
                    : "Keep swiping until you've aligned with 10 characters, then rank them."
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
        <div className="mx-auto flex w-full max-w-sm flex-col items-stretch gap-3">
          <div className="flex items-center justify-center gap-3">
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
          <Button
            variant="ghost"
            size="sm"
            aria-label="Don't know"
            disabled={saving}
            leading={<HelpCircle size={16} />}
            onClick={() => recordDontKnow(current)}
          >
            Don&apos;t know
          </Button>
        </div>
      )}

      {includeReviewed && current && (
        <p className="text-center text-[13px] text-fg-subtle">
          Review mode — swiping updates your saved answer. Don&apos;t know skips
          without changing your answer.
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    video.muted = true;
    void video.play().catch(() => {});

    if (audio) {
      audio.volume = 0.45;
      void audio.play().catch(() => {});
    }

    return () => {
      audio?.pause();
      if (audio) audio.currentTime = 0;
    };
  }, [character.id]);

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
    audioRef.current?.pause();
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
      <div className="relative h-full overflow-hidden rounded-3xl border border-border shadow-[0_24px_64px_-28px_rgba(0,0,0,0.45)]">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={character.videoUrl}
          playsInline
          loop
          muted
          preload="metadata"
        />
        <audio ref={audioRef} src={character.themeAudioUrl} loop preload="auto" />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl border-4 border-success/80 opacity-0"
          style={{ opacity: alignOpacity }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-3xl border-4 border-danger/80 opacity-0"
          style={{ opacity: misalignOpacity }}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 px-6 pb-8 pt-16 text-left text-white">
          <h2 className="text-[32px] font-semibold tracking-tight drop-shadow-sm">
            {character.name}
          </h2>
          <p className="mt-1 text-[15px] text-white/85">{character.source}</p>
          <p className="mt-4 text-[13px] text-white/70">
            Swipe right if they align with who you want to be · left if not
          </p>
        </div>
      </div>
    </div>
  );
}
