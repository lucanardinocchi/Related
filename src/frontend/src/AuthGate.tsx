import { useEffect, useState } from "react";
import type {
  AuthClient,
  InteractionsClient,
  OpenThreadsClient,
  RelationshipsClient,
  Session,
} from "@related/shared";
import { AuthedApp } from "./AuthedApp";
import { SignInScreen } from "./SignInScreen";

export interface AuthGateProps {
  authClient: AuthClient;
  relationshipsClient: RelationshipsClient;
  openThreadsClient: OpenThreadsClient;
  interactionsClient: InteractionsClient;
}

export function AuthGate({
  authClient,
  relationshipsClient,
  openThreadsClient,
  interactionsClient,
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
      onSignOut={() => {
        void authClient.signOut();
      }}
    />
  );
}
