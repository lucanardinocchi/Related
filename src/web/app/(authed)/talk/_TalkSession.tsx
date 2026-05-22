"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentTurnResult,
  CandidateAction,
  DecisionState,
  SessionHandle,
} from "@related/shared";
import { resolveSendMessageRecipients } from "@related/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { getBrowserDeps } from "@/lib/deps/client";
import { startMicCapture, type MicCaptureHandle } from "./_recorder";
import { createAudioPlayer, type AudioPlayer } from "./_audioPlayback";
import { CandidateActionCard } from "./_CandidateActionCard";

interface RelationshipOption {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface TalkSessionProps {
  relationships: RelationshipOption[];
}

interface TranscriptUserTurn {
  role: "user";
  id: string;
  text: string;
}
interface TranscriptAgentTurn {
  role: "agent";
  id: string;
  /**
   * Candidate set id from the persisted row (the PassEngine inserts the
   * row and echoes its id back in the return value).
   */
  candidateSetId: string;
  /**
   * Adapted action list from a Candidate Set returned by voice UI tests
   * or future ambient review flows.
   */
  actions: CandidateAction[];
  spokenText: string;
}
type TranscriptEntry = TranscriptUserTurn | TranscriptAgentTurn;

type VoiceState = "idle" | "recording" | "thinking";

/**
 * The web Voice agent — port of the mobile `AgentScreen` voice toggle to
 * a Next.js client component.
 *
 * Interaction model: **press-to-start / press-to-stop** (not hold-to-talk).
 * Click the mic to begin recording, click again to stop. After a stop,
 * the captured audio is handed to `voiceSessionManager.startSession`,
 * which runs STT only — Engaged Passes were removed; Ambient Intelligence
 * runs via baseline and triggered passes. Voice turns reject until a new
 * voice UX lands.
 *
 * A third press while the agent is still thinking calls `interrupt()`
 * (barge-in), cancelling the in-flight Pass + TTS.
 */
export function TalkSession({ relationships }: TalkSessionProps) {
  const [selectedId, setSelectedId] = useState<string>(
    relationships[0]?.id ?? "",
  );
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>({});
  const [error, setError] = useState<string | null>(null);

  // Long-lived refs — one per session, one per active mic capture, one
  // for the audio playback queue. Refs (not state) so that callbacks
  // fired from inside the VoiceSessionManager see the live value rather
  // than the value at registration time.
  const sessionRef = useRef<SessionHandle | null>(null);
  const micRef = useRef<MicCaptureHandle | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  // Lazy-init the playback queue exactly once on mount so the same
  // AudioPlayer survives across multiple turns. Cleaned up on unmount.
  useEffect(() => {
    playerRef.current = createAudioPlayer();
    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
      micRef.current?.stop();
      micRef.current = null;
      playerRef.current?.reset();
      playerRef.current = null;
    };
  }, []);

  const selected = useMemo(
    () => relationships.find((r) => r.id === selectedId) ?? null,
    [relationships, selectedId],
  );

  async function handleMicClick() {
    setError(null);

    // Press while thinking → barge-in.
    if (voiceState === "thinking") {
      sessionRef.current?.interrupt();
      playerRef.current?.reset();
      return;
    }

    // Press while recording → stop the mic and let the rest of the
    // pipeline run.
    if (voiceState === "recording") {
      micRef.current?.stop();
      setVoiceState("thinking");
      return;
    }

    // voiceState === "idle" → start a fresh turn.
    if (!selected) {
      setError("Pick a contact first.");
      return;
    }

    const { voiceSessionManager } = getBrowserDeps();

    let mic: MicCaptureHandle;
    try {
      mic = await startMicCapture();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start microphone capture.",
      );
      return;
    }
    micRef.current = mic;
    setVoiceState("recording");

    const handle = voiceSessionManager.startSession({
      relationshipId: selected.id,
    });
    sessionRef.current = handle;

    const player = playerRef.current;
    if (player) {
      handle.onAgentResponse((chunk) => {
        player.push(chunk);
      });
    }

    handle
      .onUserTurn(mic.audio)
      .then(async (result: AgentTurnResult) => {
        if (sessionRef.current !== handle) return;
        // Note: VoiceSessionManager's `text` is the **agent's** spoken
        // gist for the turn, not the user's transcription. The current
        // STT path doesn't surface the user's transcript separately on
        // the SessionHandle, so we show the spoken response on the
        // agent block and leave the user bubble as a placeholder
        // indicating the turn happened. A future slice can expose the
        // STT transcript on `AgentTurnResult` for proper user echo.
        const adaptedActions: CandidateAction[] = result.candidateSet.actions.map(
          (a, i) => ({
            id: `${result.candidateSet.id}-${i}`,
            type: a.type,
            payload: a.payload ?? null,
            why: a.why ?? null,
            decisionState: "pending",
          }),
        );
        setTranscript((prev) => [
          ...prev,
          { role: "user", id: `u-${Date.now()}`, text: "" },
          {
            role: "agent",
            id: result.candidateSet.id,
            candidateSetId: result.candidateSet.id,
            actions: adaptedActions,
            spokenText: result.text,
          },
        ]);
        // Kick off playback of buffered TTS audio. We intentionally
        // don't await this in the .then chain — the turn is complete
        // from the manager's perspective and we want voiceState to
        // settle. Errors are caught and surfaced.
        if (player) {
          player.flush().catch((err) => {
            setError(
              err instanceof Error ? err.message : "Audio playback failed.",
            );
          });
        }
      })
      .catch((err: Error) => {
        if (sessionRef.current !== handle) return;
        if (err.name !== "InterruptedError") {
          setError(err.message);
        }
      })
      .finally(() => {
        if (micRef.current === mic) {
          mic.stop();
          micRef.current = null;
        }
        if (sessionRef.current === handle) {
          sessionRef.current = null;
        }
        setVoiceState("idle");
      });
  }

  async function handleDecision(
    action: CandidateAction,
    intent: "accept" | "decline",
    edits?: Record<string, unknown>,
  ) {
    if (!selected) return;
    const { agentService } = getBrowserDeps();
    const candidateSetId = findCandidateSetIdFor(transcript, action.id) ?? "";

    let userEdits: { payload: Record<string, unknown> } | undefined;
    if (intent === "accept") {
      let payload = edits;
      if (action.type === "SendMessage") {
        const channel = (action.payload as { channel?: string })?.channel;
        const resolved = resolveSendMessageRecipients(selected, channel);
        payload = { ...(edits ?? {}), to: resolved };
      }
      userEdits = payload ? { payload } : undefined;
    }

    try {
      if (intent === "accept") {
        await agentService.acceptAction({ candidateSetId, action, userEdits });
      } else {
        await agentService.declineAction({ candidateSetId, action });
      }
      setDecisions((prev) => ({
        ...prev,
        [action.id]: intent === "accept" ? "picked" : "declined",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  const micLabel =
    voiceState === "recording"
      ? "Stop"
      : voiceState === "thinking"
        ? "Cancel"
        : "Start voice session";

  const micVariant =
    voiceState === "recording"
      ? "danger"
      : voiceState === "thinking"
        ? "secondary"
        : "primary";

  return (
    <div className="space-y-6">
      <Card>
        <FormField label="Who do you want to talk about?" htmlFor="rel-select">
          <select
            id="rel-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={voiceState !== "idle"}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-fg focus:ring-1 focus:ring-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {relationships.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </FormField>

        <div className="mt-4 flex items-center gap-3">
          <Button
            type="button"
            variant={micVariant}
            onClick={handleMicClick}
            // Always enabled when we have a contact — voice state
            // determines what a press does (start / stop / barge-in).
            disabled={!selected}
          >
            {micLabel}
          </Button>
          <span className="text-xs text-muted">
            {voiceState === "recording"
              ? "Recording… press Stop when you're done."
              : voiceState === "thinking"
                ? "Thinking…"
                : "Click to start. Click again to stop."}
          </span>
        </div>

        {error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </Card>

      <section className="space-y-4">
        {transcript.length === 0 ? (
          <p className="text-sm text-muted">
            No turns yet. Hit the mic to start a conversation.
          </p>
        ) : (
          transcript.map((entry) =>
            entry.role === "user" ? (
              <UserTurnBubble key={entry.id} text={entry.text} />
            ) : (
              <AgentTurnBlock
                key={entry.id}
                spokenText={entry.spokenText}
                actions={entry.actions}
                decisions={decisions}
                onAccept={(action, edits) =>
                  handleDecision(action, "accept", edits)
                }
                onDecline={(action) => handleDecision(action, "decline")}
              />
            ),
          )
        )}
      </section>
    </div>
  );
}

function UserTurnBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-surface px-4 py-2 text-sm">
        {text || <span className="italic text-muted">(no transcript)</span>}
      </div>
    </div>
  );
}

interface AgentTurnBlockProps {
  spokenText: string;
  actions: CandidateAction[];
  decisions: Record<string, DecisionState>;
  onAccept: (action: CandidateAction, edits?: Record<string, unknown>) => void;
  onDecline: (action: CandidateAction) => void;
}

function AgentTurnBlock({
  spokenText,
  actions,
  decisions,
  onAccept,
  onDecline,
}: AgentTurnBlockProps) {
  return (
    <div className="space-y-2">
      {spokenText && (
        <p className="text-sm">{spokenText}</p>
      )}
      <div className="space-y-2">
        {actions.map((a) => (
          <CandidateActionCard
            key={a.id}
            action={a}
            decisionState={decisions[a.id] ?? "pending"}
            onAccept={(edits) => onAccept(a, edits)}
            onDecline={() => onDecline(a)}
          />
        ))}
      </div>
    </div>
  );
}
function findCandidateSetIdFor(
  transcript: TranscriptEntry[],
  actionId: string,
): string | null {
  for (const entry of transcript) {
    if (entry.role !== "agent") continue;
    if (entry.actions.some((a) => a.id === actionId)) {
      return entry.candidateSetId;
    }
  }
  return null;
}
