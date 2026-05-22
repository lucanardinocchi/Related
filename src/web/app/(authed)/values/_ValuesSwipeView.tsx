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
  AlertCircle,
  ArrowRight,
  HeartHandshake,
  HelpCircle,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";
import {
  appendUniqueQueue,
  applyVideoUrl,
  buildSeedQueue,
  buildSuggestCharactersPayload,
  canSwipeValuesQueue,
  characterHasVideo,
  filterCharactersWithMedia,
  mergeCharacterRegistry,
  pipelineVideoPriorities,
  pollUntilCharacterReady,
  toValuesCharacter,
  VALUES_SWIPE_PIPELINE_DEPTH,
  VALUES_LAUNCH_CHARACTER_IDS,
  type ValuesCharacter,
  type ValuesMediaErrorCode,
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
  const swipeSeedCharacters = useMemo(
    () => filterCharactersWithMedia(seedCharacters),
    [seedCharacters],
  );

  const [registry, setRegistry] = useState(() =>
    mergeCharacterRegistry(seedCharacters, initialDynamicCharacters),
  );
  const [includeReviewed, setIncludeReviewed] = useState(false);
  const [queue, setQueue] = useState(() =>
    buildSeedQueue(
      swipeSeedCharacters,
      initialAlignments,
      false,
      VALUES_LAUNCH_CHARACTER_IDS,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<{
    code: ValuesMediaErrorCode;
    message: string;
  } | null>(null);
  const pipelineLock = useRef(false);
  const pipelineAbort = useRef<AbortController | null>(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;

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

  const inferencePayload = useMemo(
    () => buildSuggestCharactersPayload(alignments, registry, seenIds),
    [alignments, registry, seenIds],
  );

  const canSwipe = useMemo(() => canSwipeValuesQueue(queue), [queue]);

  const updateCharacterInQueue = useCallback(
    (characterId: string, videoUrl: string) => {
      const patch = (character: ValuesCharacter) =>
        character.id === characterId ? applyVideoUrl(character, videoUrl) : character;

      setQueue((prev) => prev.map(patch));
      setRegistry((prev) => prev.map(patch));
    },
    [],
  );

  const appendDraftToQueue = useCallback((draft: ValuesCharacter) => {
    setRegistry((prev) => mergeCharacterRegistry(prev, [draft]));
    setQueue((prev) => {
      if (prev.some((c) => c.id === draft.id)) return prev;
      return [...prev, draft];
    });
  }, []);

  const runMediaPipeline = useCallback(async () => {
    if (pipelineLock.current) return;
    pipelineLock.current = true;
    setPipelineBusy(true);
    setMediaError(null);

    const abort = new AbortController();
    pipelineAbort.current = abort;

    try {
      const { valuesAlignment } = getBrowserDeps();
      let workingQueue = queueRef.current;

      const seedPool = swipeSeedCharacters.filter(
        (c) => !seenIds.has(c.id) && alignments[c.id] === undefined,
      );

      while (workingQueue.length < VALUES_SWIPE_PIPELINE_DEPTH) {
        const slotIndex = workingQueue.length;
        const needsAlignmentSuggest =
          slotIndex === VALUES_SWIPE_PIPELINE_DEPTH - 1 &&
          inferencePayload.aligned.length > 0;

        if (needsAlignmentSuggest) break;

        const nextSeed = seedPool.find(
          (c) => !workingQueue.some((q) => q.id === c.id),
        );
        if (!nextSeed) break;

        workingQueue = [...workingQueue, nextSeed];
        setQueue(workingQueue);
      }

      if (
        workingQueue.length < VALUES_SWIPE_PIPELINE_DEPTH &&
        inferencePayload.aligned.length > 0
      ) {
        setPipelineMessage("Choosing a character from your alignments…");
        const start = await valuesAlignment.startValuesCharacterGeneration({
          ...inferencePayload,
        });

        if (start.status === "error") {
          setMediaError({
            code: start.code ?? "generation_failed",
            message: start.message ?? "Character generation failed",
          });
          return;
        }

        const draft = toValuesCharacter({
          id: start.character.id,
          name: start.character.name,
          source: start.character.source,
          values: start.character.values,
        });
        const withUrl = start.videoUrl
          ? applyVideoUrl(draft, start.videoUrl)
          : draft;

        appendDraftToQueue(withUrl);
        workingQueue = workingQueue.some((c) => c.id === withUrl.id)
          ? workingQueue.map((c) => (c.id === withUrl.id ? withUrl : c))
          : [...workingQueue, withUrl];

        if (start.status === "processing" && start.predictionId) {
          setPipelineMessage(`Generating video for ${withUrl.name}…`);
          const finished = await pollUntilCharacterReady(
            (payload) => valuesAlignment.pollValuesCharacterGeneration(payload),
            start.predictionId,
            withUrl,
            { signal: abort.signal },
          );

          if (finished.status === "error") {
            setMediaError({
              code: finished.code ?? "generation_failed",
              message: finished.message ?? "Video generation failed",
            });
            return;
          }
          if (finished.videoUrl) {
            updateCharacterInQueue(withUrl.id, finished.videoUrl);
          }
        }
      }

      const priorities = pipelineVideoPriorities(workingQueue);
      const targetIndex = priorities[0];
      if (targetIndex === undefined) {
        setPipelineMessage(null);
        return;
      }

      const target = workingQueue[targetIndex]!;
      if (characterHasVideo(target)) {
        setPipelineMessage(null);
        return;
      }

      setPipelineMessage(`Generating video for ${target.name}…`);
      const start = await valuesAlignment.startValuesCharacterGeneration({
        ...inferencePayload,
        character: {
          id: target.id,
          name: target.name,
          source: target.source,
          values: target.values,
        },
      });

      if (start.status === "error") {
        setMediaError({
          code: start.code ?? "generation_failed",
          message: start.message ?? "Video generation failed",
        });
        return;
      }

      if (start.status === "ready" && start.videoUrl) {
        updateCharacterInQueue(target.id, start.videoUrl);
        setPipelineMessage(null);
        return;
      }

      if (start.status === "processing" && start.predictionId) {
        const finished = await pollUntilCharacterReady(
          (payload) => valuesAlignment.pollValuesCharacterGeneration(payload),
          start.predictionId,
          target,
          { signal: abort.signal },
        );

        if (finished.status === "error") {
          setMediaError({
            code: finished.code ?? "generation_failed",
            message: finished.message ?? "Video generation failed",
          });
          return;
        }
        if (finished.videoUrl) {
          updateCharacterInQueue(target.id, finished.videoUrl);
        }
      }

      setPipelineMessage(null);
    } catch (err) {
      if (abort.signal.aborted) return;
      setMediaError({
        code: "generation_failed",
        message: err instanceof Error ? err.message : "Media pipeline failed",
      });
    } finally {
      pipelineLock.current = false;
      setPipelineBusy(false);
      pipelineAbort.current = null;
    }
  }, [
    swipeSeedCharacters,
    seenIds,
    alignments,
    inferencePayload,
    appendDraftToQueue,
    updateCharacterInQueue,
  ]);

  useEffect(() => {
    if (mediaError?.code === "insufficient_credits") return;
    if (!canSwipe && !pipelineBusy && !pipelineLock.current) {
      void runMediaPipeline();
    }
  }, [canSwipe, mediaError?.code, pipelineBusy, runMediaPipeline, queue]);

  useEffect(() => {
    return () => {
      pipelineAbort.current?.abort();
    };
  }, []);

  const restart = useCallback(
    (withReviewed: boolean) => {
      setIncludeReviewed(withReviewed);
      setMediaError(null);
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
      if (!canSwipe) return;

      setAlignments((prev) => ({
        ...prev,
        [character.id]: aligned,
      }));
      advance();

      setSaving(true);
      try {
        const { valuesAlignment } = getBrowserDeps();
        await valuesAlignment.upsertAlignment(character, aligned);
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
    [advance, canSwipe],
  );

  const recordDontKnow = useCallback(() => {
    if (!canSwipe) return;
    advance();
  }, [advance, canSwipe]);

  const current = queue[0] ?? null;
  const next = queue[1] ?? null;
  const canRank = alignedCount >= MIN_ALIGNED_FOR_RANKING;
  const swipeDisabled = saving || !canSwipe || pipelineBusy;

  if (swipeSeedCharacters.length === 0 && inferencePayload.aligned.length === 0) {
    return (
      <EmptyState
        icon={<Users size={28} />}
        title="No characters to review"
        description="Align with a character elsewhere first, or add seed media to the roster."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      {mediaError && (
        <Card className="border-danger/40 bg-danger/5">
          <div className="flex gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="text-[14px] font-medium text-fg">
                {mediaError.code === "insufficient_credits"
                  ? "Insufficient credits"
                  : "Video generation failed"}
              </p>
              <p className="mt-1 text-[13px] text-fg-muted">{mediaError.message}</p>
              {mediaError.code === "insufficient_credits" && (
                <p className="mt-2 text-[13px] text-fg-muted">
                  Add credit at{" "}
                  <a
                    href="https://replicate.com/account/billing#billing"
                    className="text-accent underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Replicate billing
                  </a>
                  , then refresh this page.
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

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
          {reviewedCount} reviewed ·{" "}
          {canSwipe
            ? "Ready to swipe"
            : pipelineMessage ?? "Preparing character videos…"}
        </p>
        {reviewedCount > 0 && !current && !pipelineBusy && (
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
            disabled={swipeDisabled}
            onSwipe={(aligned) => void recordSwipe(current, aligned)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {pipelineBusy ? (
              <div className="flex flex-col items-center gap-3 text-fg-muted">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-[14px]">
                  {pipelineMessage ?? "Preparing character videos…"}
                </p>
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
              disabled={swipeDisabled}
              leading={<ThumbsDown size={16} />}
              onClick={() => void recordSwipe(current, false)}
            >
              Doesn&apos;t align
            </Button>
            <Button
              variant="primary"
              size="md"
              aria-label="Aligns"
              disabled={swipeDisabled}
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
            disabled={swipeDisabled}
            leading={<HelpCircle size={16} />}
            onClick={() => recordDontKnow()}
          >
            Don&apos;t know
          </Button>
          {!canSwipe && !mediaError && (
            <p className="text-center text-[12px] text-fg-subtle">
              Swipe unlocks when the next 10 characters and the 11th in line
              have videos ready.
            </p>
          )}
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
  const hasVideo = characterHasVideo(character);

  useEffect(() => {
    if (!hasVideo) return;
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
  }, [character.id, character.themeAudioUrl, hasVideo, muxed]);

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
        disabled && "pointer-events-none opacity-90",
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
        {hasVideo ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={character.videoUrl}
            playsInline
            loop
            muted
            preload="metadata"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface text-fg-muted">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-[14px]">Generating {character.name}…</p>
          </div>
        )}
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
