import type { AgentService } from "../agent/AgentService";
import type { STTAdapter } from "./STTAdapter";
import type { TTSAdapter } from "./TTSAdapter";

/**
 * Active voice session as exposed to the caller. Created by
 * `VoiceSessionManager.startSession`.
 *
 * The handle is the only surface a caller needs to drive a turn-by-turn
 * voice conversation:
 *
 * - `onUserTurn(audio)` pushes a fresh stream of mic audio into the
 *   pipeline. The manager runs streaming STT, invokes the Engaged Pass
 *   with the final transcript, and streams the agent's response back
 *   via the registered TTS callback.
 * - `onAgentResponse(cb)` registers a callback for streamed TTS audio
 *   chunks. The host platform pipes these into its playback surface.
 * - `interrupt()` cancels any in-flight Pass + TTS stream (barge-in).
 *   The next `onUserTurn` is welcome immediately.
 * - `close()` ends the session and releases any open streams.
 */
export interface AgentTurnResult {
  /** Full text the agent spoke this turn. */
  text: string;
  /** The Candidate Set the Engaged Pass produced for this turn. */
  candidateSet: Awaited<ReturnType<AgentService["runEngagedTurn"]>>;
}

export interface SessionHandle {
  readonly sessionId: string;
  readonly relationshipId: string;
  /**
   * Run one User turn end-to-end: STT → Engaged Pass → TTS. Resolves
   * with the Candidate Set + spoken text once the turn completes (or
   * rejects with an AbortError if `interrupt()` cut it short).
   */
  onUserTurn(audio: AsyncIterable<Uint8Array>): Promise<AgentTurnResult>;
  /**
   * Register a callback that receives every TTS audio chunk for the
   * current and future turns. Replaces any prior callback.
   */
  onAgentResponse(callback: (chunk: Uint8Array) => void): void;
  /** Cancel any in-flight Pass + TTS stream (barge-in). */
  interrupt(): void;
  /** End the session and release streams. */
  close(): void;
}

export interface VoiceSessionManagerOptions {
  sttAdapter: STTAdapter;
  ttsAdapter: TTSAdapter;
  agentService: Pick<AgentService, "runEngagedTurn">;
  /** Override session id generation in tests. */
  generateSessionId?: () => string;
}

export interface StartSessionInput {
  relationshipId: string;
}

/**
 * Voice Session Manager — ADR-0003. Composes streaming STT, the Engaged
 * Pass (via `AgentService.runEngagedTurn`), and streaming TTS into a
 * single turn-by-turn voice session against one Relationship.
 *
 * The class is provider-agnostic by design: it depends only on the
 * `STTAdapter` and `TTSAdapter` ports, plus `AgentService`. Real
 * provider adapters land in a follow-up slice once the STT/TTS picks
 * are made (currently blocked on issue #14's HITL review).
 */
export class VoiceSessionManager {
  private readonly sttAdapter: STTAdapter;
  private readonly ttsAdapter: TTSAdapter;
  private readonly agentService: Pick<AgentService, "runEngagedTurn">;
  private readonly generateSessionId: () => string;

  constructor(opts: VoiceSessionManagerOptions) {
    this.sttAdapter = opts.sttAdapter;
    this.ttsAdapter = opts.ttsAdapter;
    this.agentService = opts.agentService;
    this.generateSessionId = opts.generateSessionId ?? defaultSessionIdGen;
  }

  startSession(input: StartSessionInput): SessionHandle {
    const sessionId = this.generateSessionId();
    const session = new Session({
      sessionId,
      relationshipId: input.relationshipId,
      sttAdapter: this.sttAdapter,
      ttsAdapter: this.ttsAdapter,
      agentService: this.agentService,
    });
    return session;
  }
}

interface SessionDeps {
  sessionId: string;
  relationshipId: string;
  sttAdapter: STTAdapter;
  ttsAdapter: TTSAdapter;
  agentService: Pick<AgentService, "runEngagedTurn">;
}

class Session implements SessionHandle {
  readonly sessionId: string;
  readonly relationshipId: string;
  private readonly sttAdapter: STTAdapter;
  private readonly ttsAdapter: TTSAdapter;
  private readonly agentService: Pick<AgentService, "runEngagedTurn">;
  private agentResponseCallback?: (chunk: Uint8Array) => void;
  private currentTurnController?: AbortController;
  private closed = false;

  constructor(deps: SessionDeps) {
    this.sessionId = deps.sessionId;
    this.relationshipId = deps.relationshipId;
    this.sttAdapter = deps.sttAdapter;
    this.ttsAdapter = deps.ttsAdapter;
    this.agentService = deps.agentService;
  }

  onAgentResponse(callback: (chunk: Uint8Array) => void): void {
    this.agentResponseCallback = callback;
  }

  async onUserTurn(
    audio: AsyncIterable<Uint8Array>,
  ): Promise<AgentTurnResult> {
    if (this.closed) {
      throw new Error("VoiceSessionManager: session is closed");
    }
    // Each turn gets its own AbortController so `interrupt()` can cut
    // exactly the in-flight turn without affecting future turns.
    const controller = new AbortController();
    this.currentTurnController = controller;

    try {
      const finalTranscript = await this.runStt(audio, controller.signal);
      throwIfAborted(controller.signal);

      // Race the Engaged Pass against the abort signal. AgentService
      // doesn't yet take a signal — interrupt during a Sonnet call lets
      // the call complete in the background but cuts the visible turn
      // synchronously. A real provider-level cancel can hook in here
      // once the agent layer gains a signal parameter.
      const candidateSet = await raceAgainstAbort(
        this.agentService.runEngagedTurn({
          relationshipId: this.relationshipId,
          userTurn: finalTranscript,
          sessionId: this.sessionId,
        }),
        controller.signal,
      );
      throwIfAborted(controller.signal);

      const text = spokenTextForCandidateSet(candidateSet);
      await this.runTts(text, controller.signal);
      throwIfAborted(controller.signal);

      return { text, candidateSet };
    } finally {
      if (this.currentTurnController === controller) {
        this.currentTurnController = undefined;
      }
    }
  }

  interrupt(): void {
    this.currentTurnController?.abort(new InterruptedError());
  }

  close(): void {
    this.closed = true;
    this.currentTurnController?.abort(new InterruptedError("session closed"));
    this.currentTurnController = undefined;
    this.agentResponseCallback = undefined;
  }

  private async runStt(
    audio: AsyncIterable<Uint8Array>,
    signal: AbortSignal,
  ): Promise<string> {
    let finalTranscript = "";
    const events = this.sttAdapter.transcribeStream({ audio, signal });
    for await (const event of events) {
      if (signal.aborted) break;
      if (event.final !== undefined) finalTranscript = event.final;
      if (event.endOfSpeech) break;
    }
    return finalTranscript;
  }

  private async runTts(text: string, signal: AbortSignal): Promise<void> {
    const chunks = this.ttsAdapter.synthesizeStream({ text, signal });
    for await (const chunk of chunks) {
      if (signal.aborted) break;
      this.agentResponseCallback?.(chunk);
    }
  }
}

/**
 * Thrown internally when a turn is cut by `interrupt()` or `close()`.
 * Callers see this as a rejection from `onUserTurn`.
 */
export class InterruptedError extends Error {
  readonly name = "InterruptedError";
  constructor(message = "voice session turn interrupted") {
    super(message);
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const reason = (signal as AbortSignal & { reason?: unknown }).reason;
    if (reason instanceof Error) throw reason;
    throw new InterruptedError();
  }
}

/**
 * Awaits `promise`, but rejects immediately if `signal` aborts first.
 * The original promise is left running — adapters that don't accept a
 * signal can finish their work in the background, but they cannot
 * influence the turn after the manager has moved on.
 */
function raceAgainstAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(
      ((signal as AbortSignal & { reason?: unknown }).reason as Error) ??
        new InterruptedError(),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      const reason = (signal as AbortSignal & { reason?: unknown }).reason;
      reject(reason instanceof Error ? reason : new InterruptedError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Render the agent's Candidate Set into the spoken text for the turn.
 * The first action's `why` (or its type, as a fallback) is the spoken
 * gist — the rest of the set surfaces in the UI alongside the response.
 * Real prompt design lives in the Engaged Pass; this just unwraps it.
 */
function spokenTextForCandidateSet(
  candidateSet: Awaited<ReturnType<AgentService["runEngagedTurn"]>>,
): string {
  const first = candidateSet.actions[0];
  if (!first) return "";
  return first.why ?? first.type;
}

function defaultSessionIdGen(): string {
  // Crypto-grade ids aren't required — the session id is scoped to a
  // single live voice conversation. Use a timestamp + random suffix so
  // tests don't need to mock anything and ids stay readable in logs.
  const rand = Math.random().toString(36).slice(2, 10);
  return `vs-${Date.now()}-${rand}`;
}
