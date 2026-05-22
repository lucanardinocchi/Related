"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Mic, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Body, Eyebrow, Mono, Small } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";
import { MarketingLinkButton } from "./MarketingLinkButton";
import { PocketDeviceIllustration } from "./PocketDeviceIllustration";

const POCKET_URL = "https://heypocket.com";

const DEMO_STEPS = [
  { id: "recording", label: "Record" },
  { id: "transcribing", label: "Transcribe" },
  { id: "matching", label: "Match" },
  { id: "extracting", label: "Extract" },
] as const;

type DemoStep =
  | "idle"
  | "recording"
  | "transcribing"
  | "matching"
  | "extracting"
  | "complete";

const POCKET_EXTRACTS = [
  {
    label: "Note",
    body: "Moving to London in March. Wants intros to design leads in her new city.",
  },
  {
    label: "Open thread",
    body: "Send portfolio to her team before she relocates.",
  },
  {
    label: "Interaction",
    body: "Coffee catch-up logged on Maya Chen's timeline.",
  },
];

const TRANSCRIPT_LINES = [
  "Maya: I'm moving to London in March, so I'm trying to meet design leads before I go.",
  "You: I'll intro you to a few people on my team. Send me your portfolio this week.",
  "Maya: That would be amazing. I'll follow up after our coffee.",
];

function formatElapsed(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function Waveform({ active }: { active: boolean }) {
  return (
    <div
      className="flex h-10 items-end justify-center gap-1"
      aria-hidden={!active}
      role={active ? "img" : undefined}
      aria-label={active ? "Recording waveform" : undefined}
    >
      {Array.from({ length: 24 }, (_, index) => (
        <span
          key={index}
          className={cn(
            "w-1 rounded-full transition-all duration-300",
            active ? "animate-pulse bg-accent" : "bg-border",
          )}
          style={
            active
              ? {
                  height: `${18 + ((index * 17) % 28)}px`,
                  animationDelay: `${index * 45}ms`,
                }
              : { height: "4px" }
          }
        />
      ))}
    </div>
  );
}

function StepIndicator({ step }: { step: DemoStep }) {
  const activeIndex =
    step === "idle"
      ? -1
      : step === "complete"
        ? DEMO_STEPS.length
        : DEMO_STEPS.findIndex((item) => item.id === step);

  return (
    <ol className="grid grid-cols-4 gap-2">
      {DEMO_STEPS.map((item, index) => {
        const done = activeIndex > index || step === "complete";
        const active = activeIndex === index;

        return (
          <li
            key={item.id}
            className={cn(
              "rounded-md border px-2 py-2 text-center transition-colors",
              done
                ? "border-success/20 bg-success-subtle"
                : active
                  ? "border-accent/30 bg-accent-subtle"
                  : "border-border bg-bg",
            )}
          >
            <div className="flex items-center justify-center gap-1">
              {done ? (
                <CheckCircle2 size={12} className="text-success" aria-hidden />
              ) : (
                <span
                  className={cn(
                    "inline-flex h-2 w-2 rounded-full",
                    active ? "bg-accent" : "bg-border-strong",
                  )}
                  aria-hidden
                />
              )}
              <Small className={cn(active || done ? "text-fg" : "text-fg-subtle")}>
                {item.label}
              </Small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PocketDeviceShowcase({
  step,
  elapsed,
  motionEnabled,
}: {
  step: DemoStep;
  elapsed: number;
  motionEnabled: boolean;
}) {
  const recording = step === "recording";

  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div
        className="pointer-events-none absolute inset-x-6 top-8 h-48 rounded-full bg-[radial-gradient(circle,var(--color-accent-subtle),transparent_72%)]"
        aria-hidden
      />

      <div
        className={cn(
          "relative overflow-hidden rounded-[1.75rem] border bg-bg p-5 shadow-[0_24px_60px_-28px_rgba(55,53,47,0.28)] transition-transform duration-500",
          motionEnabled && recording && "scale-[1.01]",
        )}
      >
        {recording ? (
          <div
            className="pointer-events-none absolute inset-0 rounded-[1.75rem] ring-2 ring-danger/25"
            aria-hidden
          />
        ) : null}

        <div className="relative flex aspect-[3/5] items-center justify-center px-6 py-2">
          <PocketDeviceIllustration recording={recording} />
        </div>

        <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-2 w-2 rounded-full",
                  recording
                    ? "animate-pulse bg-danger"
                    : step === "complete"
                      ? "bg-success"
                      : "bg-fg-subtle",
                )}
                aria-hidden
              />
              <Small>
                {recording
                  ? "Recording coffee with Maya Chen"
                  : step === "idle"
                    ? "Ready when the conversation starts"
                    : step === "complete"
                      ? "Saved to Related"
                      : "Processing in Related"}
              </Small>
            </div>
            {recording ? (
              <Mono className="text-[13px] text-fg">{formatElapsed(elapsed)}</Mono>
            ) : null}
          </div>
          <div className="mt-3">
            <Waveform active={recording} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RelatedPreview({
  step,
  visibleExtracts,
  transcriptLines,
}: {
  step: DemoStep;
  visibleExtracts: number;
  transcriptLines: number;
}) {
  const statusTone =
    step === "complete"
      ? "sent"
      : step === "recording"
        ? "review"
        : step === "idle"
          ? "draft"
          : "approved";

  const statusLabel =
    step === "idle"
      ? "Waiting"
      : step === "recording"
        ? "Listening"
        : step === "transcribing"
          ? "Transcribing"
          : step === "matching"
            ? "Matching speaker"
            : step === "extracting"
              ? "Extracting"
              : "Imported";

  return (
    <Card className="border border-border bg-bg p-5 shadow-2">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface">
          <Mic size={16} className="text-fg-muted" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <Small className="uppercase tracking-[0.08em]">Related preview</Small>
          <div className="text-[15px] font-medium">Coffee with Maya Chen</div>
        </div>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>

      <p className="mt-3 text-[13px] leading-[20px] text-fg-muted">
        {step === "idle"
          ? "Run the demo to see what Related would remember from a real conversation."
          : step === "recording"
            ? "Pocket captures the room while you stay present in the conversation."
            : step === "transcribing"
              ? "The transcript arrives automatically once Pocket finishes processing."
              : step === "matching"
                ? "Related matches speakers to the right relationship profile."
                : step === "extracting"
                  ? "The Extraction Pass turns conversation detail into structured context."
                  : "This is the context people usually lose by the end of the week."}
      </p>

      {(step === "transcribing" ||
        step === "matching" ||
        step === "extracting" ||
        step === "complete") && (
        <div className="mt-4 rounded-md border border-border bg-surface p-3">
          <Small className="block text-fg-subtle">Transcript excerpt</Small>
          <div className="mt-2 space-y-2">
            {TRANSCRIPT_LINES.map((line, index) => (
              <p
                key={line}
                className={cn(
                  "text-[13px] leading-[20px] text-fg transition-all duration-500",
                  index < transcriptLines ? "opacity-100" : "opacity-0",
                )}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="my-4 flex items-center gap-2 text-[12px] text-fg-subtle">
        <span className="h-px flex-1 bg-border" />
        Added to Maya Chen
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        {POCKET_EXTRACTS.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              "rounded-md border border-border bg-surface px-3 py-2 transition-all duration-500",
              index < visibleExtracts
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0",
            )}
          >
            <Small className="block text-fg-subtle">{item.label}</Small>
            <p className="mt-0.5 text-[13px] leading-[20px] text-fg">{item.body}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PocketMarketingSection() {
  const [step, setStep] = useState<DemoStep>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [visibleExtracts, setVisibleExtracts] = useState(0);
  const [transcriptLines, setTranscriptLines] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const timersRef = useRef<number[]>([]);
  const intervalRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timersRef.current.push(id);
  }, []);

  const runDemo = useCallback(() => {
    clearTimers();
    setStep("recording");
    setElapsed(0);
    setVisibleExtracts(0);
    setTranscriptLines(0);

    intervalRef.current = window.setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);

    schedule(() => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setElapsed(42);
      setStep("transcribing");
    }, 2800);

    schedule(() => {
      setTranscriptLines(1);
    }, 3400);

    schedule(() => {
      setTranscriptLines(2);
    }, 3900);

    schedule(() => {
      setTranscriptLines(3);
      setStep("matching");
    }, 4500);

    schedule(() => {
      setStep("extracting");
    }, 5600);

    schedule(() => {
      setVisibleExtracts(1);
    }, 6100);

    schedule(() => {
      setVisibleExtracts(2);
    }, 6600);

    schedule(() => {
      setVisibleExtracts(3);
      setStep("complete");
    }, 7100);
  }, [clearTimers, schedule]);

  useEffect(() => {
    setMotionEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    return () => clearTimers();
  }, [clearTimers]);

  const demoRunning =
    step !== "idle" && step !== "complete";

  return (
    <section id="pocket" className="border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>Pocket integration</Eyebrow>
          <h2 className="mt-2 text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-fg sm:text-[32px]">
            Surface the context that usually gets lost
          </h2>
          <Body className="mt-4 text-fg-muted">
            You leave a coffee with good intentions. By Friday, the intro you
            promised and the detail about her move are gone.{" "}
            <a
              href={POCKET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Pocket
            </a>{" "}
            records the conversation. Related imports it and keeps the useful
            parts on the right relationship.
          </Body>
        </div>

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-6">
            <StepIndicator step={step} />

            <PocketDeviceShowcase
              step={step}
              elapsed={elapsed}
              motionEnabled={motionEnabled}
            />

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="primary"
                className="h-10 px-4"
                disabled={demoRunning}
                onClick={runDemo}
              >
                {step === "complete" ? "Replay demo" : "Run the demo"}
              </Button>
              {step === "complete" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 px-4"
                  leading={<RotateCcw size={14} aria-hidden />}
                  onClick={() => {
                    clearTimers();
                    setStep("idle");
                    setElapsed(0);
                    setVisibleExtracts(0);
                    setTranscriptLines(0);
                  }}
                >
                  Reset
                </Button>
              ) : (
                <Small className="sm:px-2">
                  {demoRunning
                    ? "Follow the flow on the right. No account needed."
                    : "Takes about 8 seconds. Shows record → import → extraction."}
                </Small>
              )}
            </div>

            <ul className="space-y-2.5 border-t border-border pt-6">
              {[
                "Automatic import when Pocket finishes transcription",
                "Speaker matching ties the conversation to the right contact",
                "Commitments and follow-ups extracted from what you actually said",
                "Ambient Intelligence uses the new context on the next pass",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[14px] text-fg">
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0 text-success"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3">
              <a
                href={POCKET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-md bg-fg px-4 text-[14px] font-medium text-fg-on-accent transition-colors hover:bg-[#1f1d18]"
              >
                Get Pocket
              </a>
              <MarketingLinkButton href="/sign-up" variant="secondary">
                Connect in Related
              </MarketingLinkButton>
            </div>
          </div>

          <RelatedPreview
            step={step}
            visibleExtracts={visibleExtracts}
            transcriptLines={transcriptLines}
          />
        </div>
      </div>
    </section>
  );
}
