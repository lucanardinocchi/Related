import { useEffect, useState } from "react";
import type {
  AgentService,
  AuthClient,
  CandidatesClient,
  ChatsClient,
  GroupsClient,
  InteractionsClient,
  OAuthSignInProvider,
  OnboardingClient,
  OpenThreadsClient,
  RelationshipsClient,
  Session,
  STTAdapter,
  TTSPlayback,
  UserContextClient,
  UserProviderTokensClient,
  VoiceSessionManager,
} from "@related/shared";
import type { AudioCaptureHandle } from "./voice/ExpoAudioRecorder";
import { AuthedApp } from "./AuthedApp";
import { OnboardingScreen } from "./OnboardingScreen";
import { SignInScreen } from "./SignInScreen";

export interface AuthGateProps {
  authClient: AuthClient;
  relationshipsClient: RelationshipsClient;
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
  groupsClient: GroupsClient;
  candidatesClient: CandidatesClient;
  userContextClient: UserContextClient;
  onboardingClient: OnboardingClient;
  agentService: AgentService;
  /** Conversational Intelligence client (per ADR-0009 mobile amendment). */
  chatsClient: ChatsClient;
  /**
   * Conversational Chat voice plumbing. All three are optional so the
   * Chat tab degrades to text-only on platforms without native audio
   * (Expo Web) or in tests. Pass them together for the mic + TTS UX.
   */
  chatStartMicCapture?: () => Promise<AudioCaptureHandle>;
  chatSttAdapter?: STTAdapter;
  chatTTSPlayback?: TTSPlayback;
  /**
   * Optional. When provided, threads through into AgentScreen so the
   * Mic toggle renders. Omitted in tests that don't exercise voice.
   */
  voiceSessionManager?: VoiceSessionManager;
  userProviderTokensClient: UserProviderTokensClient;
  /** URL Supabase Auth redirects back to after OAuth; web: window.location.origin. */
  oauthRedirectTo: string;
  /** Where password-reset emails send the User (web callback → reset page). */
  passwordResetRedirectTo: string;
  onOAuthSignIn: (provider: OAuthSignInProvider) => Promise<void>;
  /** Open a URL — `(url) => { window.location.href = url; }` on web. */
  navigate: (url: string) => void;
  /**
   * iOS HealthKit permission request. Supplied by App.tsx only on iOS
   * — undefined on web/Android (the Onboarding HealthKit step falls
   * back to the Skip path with an "iOS only in v1" note).
   */
  requestHealthKit?: () => Promise<{ granted: boolean }>;
}

export function AuthGate({
  authClient,
  relationshipsClient,
  openThreadsClient,
  interactionsClient,
  groupsClient,
  candidatesClient,
  userContextClient,
  onboardingClient,
  agentService,
  chatsClient,
  chatStartMicCapture,
  chatSttAdapter,
  chatTTSPlayback,
  voiceSessionManager,
  userProviderTokensClient,
  oauthRedirectTo,
  passwordResetRedirectTo,
  onOAuthSignIn,
  navigate,
  requestHealthKit,
}: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [onboardingFinished, setOnboardingFinished] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    authClient.getSession().then((s) => {
      if (cancelled) return;
      setSession(s);
      setLoaded(true);
    });
    const unsubscribe = authClient.onAuthStateChange((s) => {
      setSession(s);
      // Reset onboarding state on sign-out so the next signed-in User
      // re-checks (existing-User path or onboarding-needed path).
      if (!s) setOnboardingFinished(null);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authClient]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    onboardingClient.getState().then((state) => {
      if (cancelled) return;
      setOnboardingFinished(state.isFinished);
    });
    return () => {
      cancelled = true;
    };
  }, [session, onboardingClient]);

  if (!loaded) return null;

  if (!session) {
    return (
      <SignInScreen
        authClient={authClient}
        onSignedIn={setSession}
        passwordResetRedirectTo={passwordResetRedirectTo}
        onOAuthSignIn={onOAuthSignIn}
      />
    );
  }

  // Block on onboarding-state load so we don't briefly flash Home before
  // routing into onboarding (or vice versa).
  if (onboardingFinished === null) return null;

  if (!onboardingFinished) {
    return (
      <OnboardingScreen
        onboardingClient={onboardingClient}
        authClient={authClient}
        userProviderTokensClient={userProviderTokensClient}
        oauthRedirectTo={oauthRedirectTo}
        navigate={navigate}
        requestHealthKit={requestHealthKit}
        onFinished={() => setOnboardingFinished(true)}
      />
    );
  }

  return (
    <AuthedApp
      relationshipsClient={relationshipsClient}
      openThreadsClient={openThreadsClient}
      interactionsClient={interactionsClient}
      groupsClient={groupsClient}
      candidatesClient={candidatesClient}
      userContextClient={userContextClient}
      agentService={agentService}
      chatsClient={chatsClient}
      chatStartMicCapture={chatStartMicCapture}
      chatSttAdapter={chatSttAdapter}
      chatTTSPlayback={chatTTSPlayback}
      voiceSessionManager={voiceSessionManager}
      onSignOut={() => {
        void authClient.signOut();
      }}
    />
  );
}
