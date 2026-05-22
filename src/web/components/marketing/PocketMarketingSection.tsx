"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Body, Eyebrow, Small } from "@/components/ui/Typography";
import { cn } from "@/lib/cn";
import { MarketingLinkButton } from "./MarketingLinkButton";

const POCKET_URL = "https://heypocket.com";

const POCKET_EXTRACTS = [
  "Note: Moving to London in March, wants intro to design leads",
  "Open thread: Send portfolio to her team",
  "Interaction: Coffee catch-up logged on the timeline",
];

type DemoPhase = "idle" | "recording" | "imported";

function PocketDevice({
  phase,
  onToggle,
}: {
  phase: DemoPhase;
  onToggle: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [motionEnabled, setMotionEnabled] = useState(true);

  useEffect(() => {
    setMotionEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const handleMove = useCallback(
    (event: React.MouseEvent) => {
      if (!motionEnabled) return;
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -14, y: x * 18 });
  }, [motionEnabled]);

  const handleLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  const recording = phase === "recording";

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ perspective: "900px" }}>
        <div
          className="pointer-events-none absolute -inset-10 rounded-full bg-[radial-gradient(circle,var(--color-accent-subtle),transparent_70%)] opacity-60"
          aria-hidden
        />

        <button
          ref={buttonRef}
          type="button"
          onClick={onToggle}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          aria-pressed={recording}
          aria-label={
            phase === "imported"
              ? "Reset Pocket demo"
              : recording
                ? "Stop demo recording"
                : "Start demo recording"
          }
          className="relative rounded-[2.5rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <div
            className="relative transition-transform duration-200 ease-out"
            style={{
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            }}
          >
            {recording && motionEnabled ? (
              <>
                <span
                  className="absolute -inset-3 animate-ping rounded-[2.75rem] bg-danger/15"
                  aria-hidden
                />
                <span
                  className="absolute -inset-1 animate-pulse rounded-[2.65rem] bg-danger/10"
                  aria-hidden
                />
              </>
            ) : null}

            <div
              className={cn(
                "relative h-[220px] w-[168px] rounded-[2.25rem] border shadow-[0_24px_48px_-20px_rgba(55,53,47,0.35)]",
                "bg-gradient-to-br from-[#eceae6] via-[#d8d6d1] to-[#b9b7b2]",
                recording ? "border-danger/30" : "border-[#c8c6c1]",
              )}
            >
              <div
                className="absolute inset-x-5 top-5 h-8 rounded-full bg-gradient-to-b from-[#f5f4f1] to-[#dddcd8] shadow-inner"
                aria-hidden
              />

              <div className="absolute left-4 top-[4.5rem] space-y-1.5" aria-hidden>
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex gap-1">
                    {[0, 1, 2, 3].map((col) => (
                      <span
                        key={col}
                        className={cn(
                          "block h-1 w-1 rounded-full bg-[#8f8d88]/70",
                          recording && "animate-pulse",
                        )}
                        style={{ animationDelay: `${(row + col) * 120}ms` }}
                      />
                    ))}
                  </div>
                ))}
              </div>

              <div
                className={cn(
                  "absolute right-0 top-1/2 h-10 w-1.5 -translate-y-1/2 rounded-l-full bg-[#a8a6a1]",
                  recording && "bg-danger/70",
                )}
                aria-hidden
              />

              <div
                className="absolute bottom-6 left-1/2 h-[4.5rem] w-[4.5rem] -translate-x-1/2 rounded-full border-[5px] border-[#a8a6a1]/35 bg-[#cbc9c4]/40"
                aria-hidden
              />

              <div
                className={cn(
                  "absolute left-1/2 top-8 h-2 w-2 -translate-x-1/2 rounded-full",
                  recording ? "bg-danger shadow-[0_0_10px_rgba(185,28,28,0.8)]" : "bg-success/80",
                )}
                aria-hidden
              />

              <div className="absolute inset-x-0 bottom-5 flex justify-center">
                <span className="rounded-pill bg-[#37352f]/8 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[#6f6e69]">
                  Pocket
                </span>
              </div>
            </div>

            <div
              className="absolute -right-3 top-1/2 h-[132px] w-[18px] -translate-y-1/2 rounded-[1rem] border border-[#d3d2cf] bg-gradient-to-b from-[#f7f6f3] to-[#ebebea] shadow-md"
              aria-hidden
            >
              <div className="mx-auto mt-4 h-8 w-1 rounded-full bg-[#c8c6c1]" />
            </div>
          </div>
        </button>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-2 w-2 rounded-full",
            recording ? "animate-pulse bg-danger" : phase === "imported" ? "bg-success" : "bg-fg-subtle",
          )}
          aria-hidden
        />
        <Small>
          {phase === "imported"
            ? "Transcript imported into Related"
            : recording
              ? "Recording coffee with Maya Chen…"
              : "Click the device to start a demo recording"}
        </Small>
      </div>
    </div>
  );
}

function PocketImportPanel({
  phase,
  visibleCount,
}: {
  phase: DemoPhase;
  visibleCount: number;
}) {
  return (
    <Card className="border border-border bg-bg p-5 shadow-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface">
          <Mic size={16} className="text-fg-muted" aria-hidden />
        </div>
        <div>
          <Small className="uppercase tracking-[0.08em]">Pocket recording</Small>
          <div className="text-[15px] font-medium">Coffee with Maya Chen</div>
        </div>
        <Badge
          tone={phase === "imported" ? "sent" : phase === "recording" ? "review" : "draft"}
          className="ml-auto"
        >
          {phase === "imported" ? "Imported" : phase === "recording" ? "Recording" : "Ready"}
        </Badge>
      </div>

      <p className="mt-3 text-[13px] leading-[20px] text-fg-muted">
        {phase === "imported"
          ? "42 min · transcribed and matched to the right relationship"
          : phase === "recording"
            ? "Capturing the conversation in the room…"
            : "Press once on Pocket to capture a real-world conversation."}
      </p>

      <div className="my-4 flex items-center gap-2 text-[12px] text-fg-subtle">
        <span className="h-px flex-1 bg-border" />
        Extraction Pass
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <Small className="block text-fg-subtle">Added to Maya Chen</Small>
        {POCKET_EXTRACTS.map((item, index) => (
          <div
            key={item}
            className={cn(
              "rounded-md bg-surface px-3 py-2 text-[13px] leading-[20px] text-fg transition-all duration-500",
              index < visibleCount
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0",
            )}
          >
            {item}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PocketMarketingSection() {
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [visibleCount, setVisibleCount] = useState(0);

  const handleDeviceToggle = useCallback(() => {
    if (phase === "idle") {
      setPhase("recording");
      setVisibleCount(0);
      return;
    }

    if (phase === "recording") {
      setPhase("imported");
      setVisibleCount(0);
      POCKET_EXTRACTS.forEach((_, index) => {
        window.setTimeout(() => {
          setVisibleCount(index + 1);
        }, 180 * (index + 1));
      });
      return;
    }

    setPhase("idle");
    setVisibleCount(0);
  }, [phase]);

  return (
    <section id="pocket" className="border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Pocket integration</Eyebrow>
          <h2 className="mt-2 text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-fg sm:text-[32px]">
            Surface the context that usually gets lost
          </h2>
          <Body className="mt-4 text-fg-muted">
            Link Related to{" "}
            <a
              href={POCKET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Pocket
            </a>
            . Wear the device, record coffees and calls, and let Related turn
            transcripts into relationship context you would otherwise forget.
          </Body>
        </div>

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-12">
          <div className="space-y-6">
            <ul className="space-y-2.5">
              {[
                "Automatic import when Pocket finishes transcription",
                "Speaker matching ties the conversation to the right contact",
                "Commitments and follow-ups extracted from what you actually said",
                "Ambient Intelligence uses the new context on the next pass",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[14px] text-fg">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
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

          <PocketDevice phase={phase} onToggle={handleDeviceToggle} />

          <PocketImportPanel phase={phase} visibleCount={visibleCount} />
        </div>
      </div>
    </section>
  );
}
