/**
 * Silent-write pipeline for Situational State per ADR-0002 / Slice 10.
 *
 * In production (Slice 8 onward) the Engaged Pass detects life-change
 * mentions via a structured tool call against Claude — the LLM is the
 * detector. Slice 10 ships a small rule-based default so the pipeline
 * is testable + usable without an LLM key. Slice 8 swaps the
 * `LifeChangeDetector` for the LLM version; everything downstream stays
 * the same.
 *
 * The pipeline is:
 *   utterance → detector → (maybe) new state → write → return surface
 *
 * The caller (Engaged Pass) renders `result.surface` inline in the
 * transcript so the User can see what the agent captured.
 */

export interface LifeChangeDetection {
  /** The proposed new Situational State, or null if no change was detected. */
  newState: string | null;
  /** One-line explanation visible to the User in the transcript surface. */
  why: string;
}

export type LifeChangeDetector = (
  utterance: string,
  currentState: string | null,
) => LifeChangeDetection;

/**
 * Rule-based default. Catches the most common life-change phrasings —
 * "I just moved to X", "I moved to X", "I started a new job at X", etc.
 * Conservative on purpose: false negatives are fine (User can edit
 * Situational State manually), false positives churn the agent's
 * understanding of the User's life. The LLM detector in Slice 8 widens
 * the recall.
 */
export const defaultLifeChangeDetector: LifeChangeDetector = (
  utterance,
  currentState,
) => {
  const u = utterance.trim();

  const movedMatch = u.match(
    /\bI (?:just )?moved to ([A-Z][\w\s]+?)(?=[.,!?]|\s+(?:last|recently|in|on|because|after|when)\b|$)/i,
  );
  if (movedMatch) {
    const place = movedMatch[1].trim();
    const proposed = `Just moved to ${place}`;
    if (currentState && currentState.toLowerCase().includes(`moved to ${place.toLowerCase()}`)) {
      return { newState: null, why: "already captured" };
    }
    return {
      newState: proposed,
      why: `Detected a recent move to ${place}.`,
    };
  }

  const jobMatch = u.match(
    /\bI (?:just )?started a new job (?:at|with) ([A-Z][\w\s&]+?)(?=[.,!?]|$)/i,
  );
  if (jobMatch) {
    const company = jobMatch[1].trim();
    const proposed = `Just started a new job at ${company}`;
    if (currentState && currentState.toLowerCase().includes(`job at ${company.toLowerCase()}`)) {
      return { newState: null, why: "already captured" };
    }
    return {
      newState: proposed,
      why: `Detected a new job at ${company}.`,
    };
  }

  return { newState: null, why: "no life-change signal" };
};

export interface SilentWriteInput {
  utterance: string;
  currentState: string | null;
  write: (newState: string) => Promise<void>;
  detect: LifeChangeDetector;
}

export interface SilentWriteResult {
  updated: boolean;
  newState?: string;
  /** Inline text the caller surfaces in the chat transcript. */
  surface: string;
  why: string;
}

export async function tryUpdateSituationalState(
  input: SilentWriteInput,
): Promise<SilentWriteResult> {
  const { utterance, currentState, write, detect } = input;
  const { newState, why } = detect(utterance, currentState);
  if (!newState) {
    return { updated: false, surface: "", why };
  }
  await write(newState);
  return {
    updated: true,
    newState,
    why,
    surface: `Updated your Situational State: "${newState}". ${why}`,
  };
}
