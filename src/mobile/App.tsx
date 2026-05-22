import { Linking, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  InterTight_900Black,
} from "@expo-google-fonts/inter-tight";
import { createClient } from "@supabase/supabase-js";
import {
  AgentService,
  AuthClient,
  CandidatesClient,
  ChatsClient,
  createTTSPlayback,
  ElevenLabsTTSAdapter,
  GroupsClient,
  InteractionsClient,
  OnboardingClient,
  WisprFlowSTTAdapter,
  OpenThreadsClient,
  PlatformSleepFetcher,
  RelationshipsClient,
  SystemLinkingComposer,
  UserContextClient,
  AmbientIntelligencePreferencesClient,
  UserProviderTokensClient,
} from "@related/shared";
import { AuthGate } from "./src/AuthGate";
import {
  authOAuthRedirectUri,
  completeOAuthFromBrowser,
  ensureOnboardingForNewOAuthUser,
} from "./src/auth/completeOAuthSession";
import type { OAuthSignInProvider } from "@related/shared";
import { createMobileAudioPlayer } from "./src/voice/createMobileAudioPlayer";
import { createMobileMicCapture } from "./src/voice/createMobileMicCapture";
import {
  iosHealthKitSleepAdapter,
  requestPermissionAsync as requestHealthKitPermission,
} from "./modules/healthkit";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Check src/mobile/.env.",
  );
}

// One SupabaseClient shared across the app so auth state and PostgREST
// queries use the same JWT and storage.
//
// `persistSession: true` is required for the OAuth-redirect-back flow
// (ADR-0006): the User leaves the app for Google consent and returns;
// without persistence the in-memory session is lost. On web the default
// storage (localStorage) handles this. On native a future slice wires
// `expo-secure-store` or AsyncStorage.
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
  },
});
const authClient = new AuthClient(supabase);
const relationshipsClient = new RelationshipsClient(supabase);
const openThreadsClient = new OpenThreadsClient(supabase);
const interactionsClient = new InteractionsClient(supabase);
const groupsClient = new GroupsClient(supabase);
const candidatesClient = new CandidatesClient(supabase);
// ChatsClient — Conversational Intelligence on mobile per ADR-0009
// mobile amendment. Same Supabase client as web, so multi-tenant
// isolation flows from the same JWT and RLS policies.
const chatsClient = new ChatsClient(supabase);
const resolveOwnerId = async () => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("No signed-in user");
  return data.user.id;
};
const userContextClient = new UserContextClient(supabase, resolveOwnerId);
const ambientIntelligencePreferencesClient =
  new AmbientIntelligencePreferencesClient(supabase, resolveOwnerId);
const onboardingClient = new OnboardingClient(supabase, resolveOwnerId);
const userProviderTokensClient = new UserProviderTokensClient(
  supabase,
  resolveOwnerId,
);
const messageComposer = new SystemLinkingComposer({
  openURL: (url) => Linking.openURL(url),
});
const agentService = new AgentService({ supabase, messageComposer });

// Voice pipeline for Conversational Chat: STT/TTS adapters proxy through
// Edge Functions so API keys never reach the client bundle (ADR-0006).
const sttAdapter = new WisprFlowSTTAdapter({ supabase });
const ttsAdapter = new ElevenLabsTTSAdapter({ supabase });

// Conversational Intelligence voice plumbing per ADR-0009 mobile
// amendment. Mic + auto-TTS only render on iOS / Android — Expo Web
// has its own MediaRecorder pipeline (the existing _recorder.ts on
// web), which we re-route through the Conversational tab in the future
// if we ship Expo Web. Today: native-only, undefined on web so the
// composer falls back to text-only.
const isNative = Platform.OS === "ios" || Platform.OS === "android";
const mobileTTSPlayback = isNative
  ? createTTSPlayback({
      ttsAdapter,
      player: createMobileAudioPlayer(),
    })
  : undefined;
const mobileMicCapture = isNative ? createMobileMicCapture : undefined;

// Where Supabase sends the User back after OAuth consent.
// Web: same origin (Vercel URL or localhost during dev).
// Native: a custom URL scheme — set up alongside the iOS native build.
const oauthRedirectTo =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : "related://oauth-callback";

const webAppOrigin =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : (process.env.EXPO_PUBLIC_WEB_URL ?? "http://127.0.0.1:3000");

const passwordResetRedirectTo = `${webAppOrigin}/auth/callback?next=/reset-password`;

const navigate = (url: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.href = url;
  } else {
    void Linking.openURL(url);
  }
};

async function handleOAuthSignIn(provider: OAuthSignInProvider) {
  const redirectTo =
    Platform.OS === "web" && typeof window !== "undefined"
      ? `${webAppOrigin}/auth/callback?next=${encodeURIComponent("/onboarding")}`
      : authOAuthRedirectUri();

  const { url } = await authClient.signInWithOAuth(provider, redirectTo);

  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.href = url;
    return;
  }

  await completeOAuthFromBrowser(supabase, url);
  await ensureOnboardingForNewOAuthUser(supabase, onboardingClient);
}

// Install the iOS HealthKit bridge into the shared library's
// PlatformSleepFetcher slot. The shared lib is Expo-free by policy —
// the mobile app owns the native-module wiring. On web/Android the slot
// stays null and PlatformSleepFetcher.fetch returns []; this mirrors
// the Slice B pattern of Platform.OS === 'web' gating.
if (Platform.OS === "ios") {
  PlatformSleepFetcher.setIosHealthKitAdapter(iosHealthKitSleepAdapter);
}

// Onboarding HealthKit grant prompt. Undefined on non-iOS so the
// Onboarding step falls back to Skip + "iOS only in v1".
const requestHealthKit =
  Platform.OS === "ios" ? () => requestHealthKitPermission() : undefined;

export default function App() {
  const [fontsLoaded] = useFonts({
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    InterTight_900Black,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthGate
        authClient={authClient}
        relationshipsClient={relationshipsClient}
        openThreadsClient={openThreadsClient}
        interactionsClient={interactionsClient}
        groupsClient={groupsClient}
        candidatesClient={candidatesClient}
        userContextClient={userContextClient}
        ambientIntelligencePreferencesClient={
          ambientIntelligencePreferencesClient
        }
        onboardingClient={onboardingClient}
        agentService={agentService}
        chatsClient={chatsClient}
        chatStartMicCapture={mobileMicCapture}
        chatSttAdapter={isNative ? sttAdapter : undefined}
        chatTTSPlayback={mobileTTSPlayback}
        userProviderTokensClient={userProviderTokensClient}
        oauthRedirectTo={oauthRedirectTo}
        passwordResetRedirectTo={passwordResetRedirectTo}
        onOAuthSignIn={handleOAuthSignIn}
        navigate={navigate}
        requestHealthKit={requestHealthKit}
      />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
