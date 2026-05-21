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
import {
  ArrowRight,
  HeartHandshake,
  HelpCircle,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";
import {
  ValuesAlignmentClient,
  appendUniqueQueue,
  buildSeedQueue,
  mergeCharacterRegistry,
  toValuesCharacter,
  QUEUE_LOW_WATER,
  VALUES_LAUNCH_CHARACTER_IDS,
  type ValuesCharacter,
} from "@related/shared";
import { MIN_ALIGNED_FOR_RANKING } from "@related/shared";
import { cn } from "@/lib/cn";
import { getBrowserDeps } from "@/lib/deps/client";
import { Button, Card, EmptyState } from "@/components/ui";

interface Props {
  seedCharacters: ValuesCharacter[];
  initialAlignments: Record<string, boolean>;
  initialDynamicCharacters: ValuesCharacter[];
}

const SWIPE_THRESHOLD = 96;
const EXIT_DISTANCE = 520;

export function ValuesSwipeView({
  seedCharacters,
  initialAlignments,
  initialDynamicCharacters,
}: Props) {
  const [alignments, setAlignments] =
    useState<Record<string, boolean>>(initialAlignments);
  const [registry, setRegistry] = useState(() =>
    mergeCharacterRegistry(seedCharacters, initialDynamicCharacters),
  );
  const [includeReviewed, setIncludeReviewed] = useState(false);
  const [queue, setQueue] = useState(() =>
    buildSeedQueue(
      seedCharacters,
      initialAlignments,
      false,
      VALUES_LAUNCH_CHARACTER_IDS,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [refilling, setRefilling] = useState(false);
  const refillLock = useRef(false);

  const seenIds = useMemo(() => {
    const ids = new Set(Object.keys(alignments));
    for (const character of registry) {
      if (alignments[character.id] !== undefined) ids.add(character.id);
    }
    return ids;
  }, [alignments, registry]);

  const alignedCount = useMemo(
    () => Object.values(alignments).filter((value) => value === true).length,
    [alignments],
  );

  const reviewedCount = useMemo(
    () => Object.keys(alignments).length,
    [alignments],
  );

  const buildSuggestPayload = useCallback(() => {
    const aligned: ReturnType<
      typeof ValuesAlignmentClient.buildInferencePayload
    >["aligned"] = [];
    const rejected: ReturnType<
      typeof ValuesAlignmentClient.buildInferencePayload
    >["rejected"] = [];

    for (const character of registry) {
      const decision = alignments[character.id];
      if (decision === undefined) continue;
      const entry = {
        characterId: character.id,
        name: character.name,
        source: character.source,
        values: character.values,
      };
      if (decision) aligned.push(entry);
      else rejected.push(entry);
    }

    return {
      aligned,
      rejected,
      excludeIds: [...seenIds],
    };
  }, [alignments, registry, seenIds]);

  const refillQueue = useCallback(async () => {
    if (refillLock.current) return;
    refillLock.current = true;
    setRefilling(true);

    try {
      const payload = buildSuggestPayload();

      if (payload.aligned.length > 0) {
        const drafts = await getBrowserDeps().valuesAlignment.suggestCharacters(
          payload,
        );
        const suggested = drafts.map((draft) => toValuesCharacter(draft));
        setRegistry((prev) => mergeCharacterRegistry(prev, suggested));
        setQueue((prev) => appendUniqueQueue(prev, suggested, seenIds));
      }

      const seedLeft = seedCharacters.filter(
        (c) => !seenIds.has(c.id) && alignments[c.id] === undefined,
      );
      if (seedLeft.length > 0) {
        setQueue((prev) => appendUniqueQueue(prev, seedLeft, seenIds));
      }
    } catch {
      const seedLeft = seedCharacters.filter(
        (c) => !seenIds.has(c.id) && alignments[c.id] === undefined,
      );
      setQueue((prev) => appendUniqueQueue(prev, seedLeft, seenIds));
    } finally {
      setRefilling(false);
      refillLock.current = false;
    }
  }, [alignments, buildSuggestPayload, seedCharacters, seenIds]);

  useEffect(() => {
    if (queue.length > QUEUE_LOW_WATER || refilling) return;
    void refillQueue();
  }, [queue.length, refilling, refillQueue]);

  const restart = useCallback(
    (withReviewed: boolean) => {
      setIncludeReviewed(withReviewed);
      setQueue(
        buildSeedQueue(registry, alignments, withReviewed, VALUES_LAUNCH_CHARACTER_IDS),
      );
    },
    [registry, alignments],
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
        await valuesAlignment.upsertAlignment(character, aligned);
        if (aligned && queue.length <= QUEUE_LOW_WATER) {
          void refillQueue();
        }
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
    [advance, queue.length, refillQueue],
  );

  const recordDontKnow = useCallback(() => {
    advance();
  }, [advance]);

  const current = queue[0] ?? null;
  const next = queue[1] ?? null;
  const canRank = alignedCount >= MIN_ALIGNED_FOR_RANKING;

  if (seedCharacters.length === 0) {
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-fg-subtle">
          {reviewedCount} reviewed · suggestions narrow as you align
        </p>
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
            {refilling ? (
              <div className="flex flex-col items-center gap-3 text-fg-muted">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-[14px]">Finding characters like your picks…</p>
              </div>
            ) : (
              <EmptyState
                icon={<HeartHandshake size={28} />}
                title="Nothing left in this pass"
                description={
                  canRank
                    ? "Rank your alignments above, or keep swiping — we'll suggest more like who you aligned with."
                    : "Align with more characters and we'll narrow in on your taste."
                }
                action={
                  <Button variant="primary" onClick={() => void refillQueue()}>
                    Load more characters
                  </Button>
                }
              />
            )}
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
            onClick={() => recordDontKnow()}
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
  const muxed = character.mediaMuxed;

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video) return;

    video.muted = true;
    video.volume = 0.45;
    void video.play().catch(() => {});

    if (!muxed && audio && character.themeAudioUrl) {
      audio.volume = 0.45;
      void audio.play().catch(() => {});
    }

    return () => {
      video.pause();
      video.currentTime = 0;
      audio?.pause();
      if (audio) audio.currentTime = 0;
    };
  }, [character.id, character.themeAudioUrl, muxed]);

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
    videoRef.current?.pause();
    audioRef.current?.pause();
    window.setTimeout(() => onSwipe(direction === "right"), 220);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || exiting) return;
    if (muxed && videoRef.current) {
      videoRef.current.muted = false;
    }
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
        {!muxed && character.themeAudioUrl ? (
          <audio
            ref={audioRef}
            src={character.themeAudioUrl}
            loop
            preload="auto"
          />
        ) : null}

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
