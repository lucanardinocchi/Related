"use client";

import {
  AgentService,
  AuthClient,
  CalendarEventsClient,
  CandidatesClient,
  ChatsClient,
  ElevenLabsTTSAdapter,
  EventsClient,
  GroupsClient,
  InteractionsClient,
  OnboardingClient,
  OpenAIWhisperSTTAdapter,
  OpenThreadsClient,
  RelationshipsClient,
  SystemLinkingComposer,
  UserContextClient,
  UserProviderTokensClient,
  VoiceSessionManager,
} from "@related/shared";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Browser-side dep factory. Same shape as getServerDeps but constructs
 * from the singleton browser Supabase client (which manages its own
 * session from localStorage). Memoised — call as many times as you like.
 */
let cached: ReturnType<typeof build> | null = null;

function build() {
  const supabase = createBrowserSupabase();

  const resolveOwnerId = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("No signed-in user");
    return data.user.id;
  };

  const messageComposer = new SystemLinkingComposer({
    openURL: (url) => {
      window.location.href = url;
    },
  });

  const agentService = new AgentService({ supabase, messageComposer });
  const sttAdapter = new OpenAIWhisperSTTAdapter({ supabase });
  const ttsAdapter = new ElevenLabsTTSAdapter({ supabase });
  const voiceSessionManager = new VoiceSessionManager({
    sttAdapter,
    ttsAdapter,
    agentService,
  });

  return {
    supabase,
    resolveOwnerId,
    auth: new AuthClient(supabase),
    relationships: new RelationshipsClient(supabase),
    openThreads: new OpenThreadsClient(supabase),
    interactions: new InteractionsClient(supabase),
    calendarEvents: new CalendarEventsClient(supabase),
    events: new EventsClient(supabase),
    groups: new GroupsClient(supabase),
    candidates: new CandidatesClient(supabase),
    chats: new ChatsClient(supabase),
    userContext: new UserContextClient(supabase, resolveOwnerId),
    onboarding: new OnboardingClient(supabase, resolveOwnerId),
    userProviderTokens: new UserProviderTokensClient(supabase, resolveOwnerId),
    agentService,
    voiceSessionManager,
    sttAdapter,
    ttsAdapter,
  };
}

export function getBrowserDeps() {
  if (!cached) cached = build();
  return cached;
}
