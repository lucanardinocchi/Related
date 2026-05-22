import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MessageComposer,
  PendingCandidateAction,
  TriggeredPassScheduler,
  UserEdits,
} from "../Executor";

export interface ExecutorRuntime {
  supabase: SupabaseClient;
  messageComposer?: MessageComposer;
}

export interface HandlerOutcome {
  decisionState: "picked" | "declined";
  mergedPayload?: unknown;
  effects?: { interactionId?: string };
}

export type ActionHandler = (
  action: PendingCandidateAction,
  userEdits: UserEdits | undefined,
  runtime: ExecutorRuntime,
  relationshipId: string,
) => Promise<HandlerOutcome>;

export type { TriggeredPassScheduler };
