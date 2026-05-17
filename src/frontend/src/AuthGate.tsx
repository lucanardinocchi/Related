import { useEffect, useState } from "react";
import type { AuthClient, Session } from "@related/shared";
import { Home } from "./Home";
import { SignInScreen } from "./SignInScreen";

export interface AuthGateProps {
  authClient: AuthClient;
}

export function AuthGate({ authClient }: AuthGateProps) {
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
    <Home
      openThreads={[]}
      upcomingEvents={[]}
      threadsClosedLast30Days={new Array(30).fill(0)}
      onSignOut={() => {
        void authClient.signOut();
      }}
    />
  );
}
