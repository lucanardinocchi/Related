import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { OwnerIdResolver } from "../user-context/UserContextClient";

/**
 * Canonical step ids, in order. The OnboardingScreen renders the lowest
 * un-completed step on mount; tapping "Continue" or "Skip" appends the
 * current step to completedSteps and advances. When every step is
 * completed (or explicitly skipped) the state is marked `finishedAt`.
 */
export const ONBOARDING_STEPS = [
  "welcome",
  "calendar",
  "healthkit",
  "notifications",
  "contacts",
  "goals",
  "done",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
  completedSteps: OnboardingStep[];
  finishedAt: string | null;
  /**
   * True for any User created before this slice landed (no row exists)
   * AND for any User who has fully finished onboarding (finishedAt set).
   * AuthGate uses this to decide whether to show OnboardingScreen.
   */
  isFinished: boolean;
}

interface OnboardingRow {
  completed_steps: string[];
  finished_at: string | null;
}

export interface OnboardingClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Reads + writes onboarding_state for the signed-in User. Pre-existing
 * Users (no row) are treated as already-finished — the slice brief
 * explicitly requires that.
 */
export class OnboardingClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly resolveOwnerId: OwnerIdResolver,
  ) {}

  static fromConfig(
    config: OnboardingClientConfig,
    resolveOwnerId: OwnerIdResolver,
  ): OnboardingClient {
    return new OnboardingClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
      resolveOwnerId,
    );
  }

  async getState(): Promise<OnboardingState> {
    const { data, error } = await this.client
      .from("onboarding_state")
      .select("completed_steps, finished_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // Pre-existing User: no row ⇒ already past onboarding.
      return { completedSteps: [], finishedAt: null, isFinished: true };
    }
    const row = data as OnboardingRow;
    return {
      completedSteps: row.completed_steps as OnboardingStep[],
      finishedAt: row.finished_at,
      isFinished: row.finished_at !== null,
    };
  }

  /**
   * Start onboarding by inserting an empty state row. Idempotent: if a
   * row already exists, returns the current state without modifying it.
   */
  async startIfNeeded(): Promise<OnboardingState> {
    const current = await this.getState();
    if (!current.isFinished) return current;
    // No row yet AND we want to start onboarding — insert one.
    const ownerId = await this.resolveOwnerId();
    const { error } = await this.client.from("onboarding_state").insert({
      owner_id: ownerId,
      completed_steps: [],
    });
    if (error && error.code !== "23505") throw error; // ignore singleton collision
    return { completedSteps: [], finishedAt: null, isFinished: false };
  }

  /**
   * Marks onboarding finished without requiring every canonical step to
   * have been visited individually (e.g. web integrations wizard with
   * optional skips).
   */
  async finishOnboarding(): Promise<OnboardingState> {
    const ownerId = await this.resolveOwnerId();
    const finishedAt = new Date().toISOString();
    const { data, error } = await this.client
      .from("onboarding_state")
      .upsert(
        {
          owner_id: ownerId,
          completed_steps: [...ONBOARDING_STEPS],
          finished_at: finishedAt,
        },
        { onConflict: "owner_id" },
      )
      .select()
      .single();
    if (error) throw error;
    const row = data as OnboardingRow;
    return {
      completedSteps: row.completed_steps as OnboardingStep[],
      finishedAt: row.finished_at,
      isFinished: true,
    };
  }

  async completeStep(step: OnboardingStep): Promise<OnboardingState> {
    const ownerId = await this.resolveOwnerId();
    const current = await this.getState();
    const completedSteps = Array.from(
      new Set<OnboardingStep>([...current.completedSteps, step]),
    );
    const allDone = ONBOARDING_STEPS.every((s) => completedSteps.includes(s));
    const finishedAt = allDone ? new Date().toISOString() : null;

    const { data, error } = await this.client
      .from("onboarding_state")
      .upsert(
        {
          owner_id: ownerId,
          completed_steps: completedSteps,
          finished_at: finishedAt,
        },
        { onConflict: "owner_id" },
      )
      .select()
      .single();
    if (error) throw error;
    const row = data as OnboardingRow;
    return {
      completedSteps: row.completed_steps as OnboardingStep[],
      finishedAt: row.finished_at,
      isFinished: row.finished_at !== null,
    };
  }

  /**
   * The next step to render — the lowest-indexed step the User hasn't
   * completed yet. Returns null when onboarding is finished.
   */
  static nextStep(state: OnboardingState): OnboardingStep | null {
    if (state.isFinished) return null;
    for (const step of ONBOARDING_STEPS) {
      if (!state.completedSteps.includes(step)) return step;
    }
    return null;
  }
}
