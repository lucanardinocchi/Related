import { useEffect, useState } from "react";
import type {
  AuthClient,
  CandidatesClient,
  GroupsClient,
  InteractionsClient,
  OnboardingClient,
  OpenThreadsClient,
  RelationshipsClient,
  Session,
  UserContextClient,
} from "@related/shared";
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
    return <SignInScreen authClient={authClient} onSignedIn={setSession} />;
  }

  // Block on onboarding-state load so we don't briefly flash Home before
  // routing into onboarding (or vice versa).
  if (onboardingFinished === null) return null;

  if (!onboardingFinished) {
    return (
      <OnboardingScreen
        onboardingClient={onboardingClient}
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
      onSignOut={() => {
        void authClient.signOut();
      }}
    />
  );
}
