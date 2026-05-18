import { useEffect, useState } from "react";
import type {
  AuthClient,
  CandidatesClient,
  GroupsClient,
  InteractionsClient,
  OpenThreadsClient,
  RelationshipsClient,
  Session,
  UserContextClient,
} from "@related/shared";
import { AuthedApp } from "./AuthedApp";
import { SignInScreen } from "./SignInScreen";

export interface AuthGateProps {
  authClient: AuthClient;
  relationshipsClient: RelationshipsClient;
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
  groupsClient: GroupsClient;
  candidatesClient: CandidatesClient;
  userContextClient: UserContextClient;
}

export function AuthGate({
  authClient,
  relationshipsClient,
  openThreadsClient,
  interactionsClient,
  groupsClient,
  candidatesClient,
  userContextClient,
}: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authClient.getSession().then((s) => {
      if (cancelled) return;
      setSession(s);
      setLoaded(true);
    });
    const unsubscribe = authClient.onAuthStateChange(setSession);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authClient]);

  if (!loaded) return null;

  if (!session) {
    return <SignInScreen authClient={authClient} onSignedIn={setSession} />;
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
