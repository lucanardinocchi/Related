import {
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasXAccess,
  tokenHasWhatsAppAccess,
  tokenHasTikTokAccess,
  tokenHasOutlookCalendarAccess,
} from "@related/shared";
import { redirect } from "next/navigation";
import { getServerDeps } from "@/lib/deps/server";
import { OnboardingWizard } from "./_OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { onboarding, userProviderTokens } = await getServerDeps();
  const state = await onboarding.getState();
  if (state.isFinished) {
    redirect("/relationships");
  }

  const googleToken = await userProviderTokens.getForProvider("google");
  const instagramToken = await userProviderTokens.getForProvider("instagram");
  const xToken = await userProviderTokens.getForProvider("x");
  const whatsappToken = await userProviderTokens.getForProvider("whatsapp");
  const tiktokToken = await userProviderTokens.getForProvider("tiktok");
  const outlookToken = await userProviderTokens.getForProvider("outlook");

  return (
    <OnboardingWizard
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
  );
}
