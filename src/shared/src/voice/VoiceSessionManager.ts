import type { PassCandidateSet } from "../candidates/candidateSet";
import type { STTAdapter } from "./STTAdapter";
import type { TTSAdapter } from "./TTSAdapter";

/**
 * Active voice session as exposed to the caller. Created by
 * `VoiceSessionManager.startSession`.
 *
 * Engaged Passes were removed — voice sessions no longer run Agent Passes.
 * The handle remains for future voice UX; `onUserTurn` rejects immediately.
 */
export interface AgentTurnResult {
  /** Full text the agent spoke this turn. */
  text: string;
  /** The Candidate Set produced for this turn (unused while Engaged is off). */
  candidateSet: PassCandidateSet;
}

export interface SessionHandle {
  readonly sessionId: string;
  readonly relationshipId: string;
  onUserTurn(audio: AsyncIterable<Uint8Array>): Promise<AgentTurnResult>;
  onAgentResponse(callback: (chunk: Uint8Array) => void): void;
  interrupt(): void;
  close(): void;
}

export interface VoiceSessionManagerOptions {
  sttAdapter: STTAdapter;
  ttsAdapter: TTSAdapter;
  /** Override session id generation in tests. */
  generateSessionId?: () => string;
}

export interface StartSessionInput {
  relationshipId: string;
}

/**
 * Voice Session Manager — ADR-0003. Previously composed STT, Engaged Pass,
 * and TTS. User-initiated Engaged Passes are removed; Ambient Intelligence
 * runs via baseline and triggered passes only.
 */
export class VoiceSessionManager {
  private readonly generateSessionId: () => string;

  constructor(opts: VoiceSessionManagerOptions) {
    this.generateSessionId = opts.generateSessionId ?? defaultSessionIdGen;
  }

  startSession(input: StartSessionInput): SessionHandle {
    const sessionId = this.generateSessionId();
    return new Session({
      sessionId,
      relationshipId: input.relationshipId,
    });
  }
}

interface SessionDeps {
  sessionId: string;
  relationshipId: string;
}

class Session implements SessionHandle {
  readonly sessionId: string;
  readonly relationshipId: string;
  private closed = false;

  constructor(deps: SessionDeps) {
    this.sessionId = deps.sessionId;
    this.relationshipId = deps.relationshipId;
  }

  onAgentResponse(_callback: (chunk: Uint8Array) => void): void {
    // No-op while Engaged Passes are disabled.
  }

  async onUserTurn(
    _audio: AsyncIterable<Uint8Array>,
  ): Promise<AgentTurnResult> {
    if (this.closed) {
      throw new Error("VoiceSessionManager: session is closed");
    }
    throw new Error(
      "Engaged passes are no longer supported. Ambient intelligence runs automatically.",
    );
  }

  interrupt(): void {
    // No in-flight turn while Engaged Passes are disabled.
  }

  close(): void {
    this.closed = true;
  }
}

function defaultSessionIdGen(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `vs-${Date.now()}-${rand}`;
}
