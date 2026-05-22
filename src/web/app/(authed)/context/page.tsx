import {
  type OperatorStrength,
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasOutlookCalendarAccess,
  tokenHasTikTokAccess,
  tokenHasWhatsAppAccess,
  tokenHasXAccess,
} from "@related/shared";
import { Suspense } from "react";
import { getServerDeps } from "@/lib/deps/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContextEditor } from "./_ContextEditor";
import { ContextOnboardingLauncher } from "./_ContextOnboardingLauncher";

export const dynamic = "force-dynamic";

async function listOperatorStrengthsSafe(
  list: () => Promise<OperatorStrength[]>,
): Promise<OperatorStrength[]> {
  try {
    return await list();
  } catch {
    // Hosted DBs that missed migration 20260521000010 would 500 here;
    // keep the rest of the context editor usable until db push lands.
    return [];
  }
}

export default async function ContextPage() {
  const { userContext, userProviderTokens } = await getServerDeps();

  const [
    goals,
    situationalState,
    operatorStrengths,
    googleToken,
    instagramToken,
    xToken,
    whatsappToken,
    tiktokToken,
    outlookToken,
  ] = await Promise.all([
    userContext.listGoals(),
    userContext.getSituationalState(),
    listOperatorStrengthsSafe(() => userContext.listOperatorStrengths()),
    userProviderTokens.getForProvider("google"),
    userProviderTokens.getForProvider("instagram"),
    userProviderTokens.getForProvider("x"),
    userProviderTokens.getForProvider("whatsapp"),
    userProviderTokens.getForProvider("tiktok"),
    userProviderTokens.getForProvider("outlook"),
  ]);

  return (
    <>
      <PageHeader
        title="Your context"
        subtitle="Goals & values stick around. Situational state is your right-now. Strengths shape what the agent proposes."
      />
      <ContextEditor
        initialGoals={goals}
        initialSituationalState={situationalState}
        initialOperatorStrengths={operatorStrengths}
      />
      <Suspense fallback={null}>
        <ContextOnboardingLauncher
          calendar={tokenHasCalendarAccess(googleToken?.scopes)}
          outlook={tokenHasOutlookCalendarAccess(outlookToken?.scopes)}
          gmail={tokenHasGmailAccess(googleToken?.scopes)}
          instagram={tokenHasInstagramAccess(instagramToken?.scopes)}
          x={tokenHasXAccess(xToken?.scopes)}
          whatsapp={tokenHasWhatsAppAccess(whatsappToken?.scopes)}
          tiktok={tokenHasTikTokAccess(tiktokToken?.scopes)}
          instagramAppId={process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID ?? null}
          xClientId={process.env.NEXT_PUBLIC_X_CLIENT_ID ?? null}
          whatsappAppId={process.env.NEXT_PUBLIC_WHATSAPP_APP_ID ?? null}
          tiktokClientKey={process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY ?? null}
          microsoftClientId={process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ?? null}
        />
      </Suspense>
    </>
  );
}
