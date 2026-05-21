import {
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasXAccess,
  tokenHasWhatsAppAccess,
  tokenHasTikTokAccess,
  tokenHasOutlookCalendarAccess,
} from "@related/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { getServerDeps } from "@/lib/deps/server";
import { IntegrationsSection } from "./_IntegrationsSection";
import { RelaySection } from "./_RelaySection";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userProviderTokens } = await getServerDeps();
  const googleToken = await userProviderTokens.getForProvider("google");
  const instagramToken = await userProviderTokens.getForProvider("instagram");
  const xToken = await userProviderTokens.getForProvider("x");
  const whatsappToken = await userProviderTokens.getForProvider("whatsapp");
  const tiktokToken = await userProviderTokens.getForProvider("tiktok");
  const outlookToken = await userProviderTokens.getForProvider("outlook");
  const instagramAppId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID ?? null;
  const xClientId = process.env.NEXT_PUBLIC_X_CLIENT_ID ?? null;
  const whatsappAppId = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID ?? null;
  const tiktokClientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY ?? null;
  const microsoftClientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ?? null;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Connect external accounts and manage integrations."
      />
      <IntegrationsSection
        initialCalendarConnected={tokenHasCalendarAccess(googleToken?.scopes)}
        initialGmailConnected={tokenHasGmailAccess(googleToken?.scopes)}
        initialInstagramConnected={tokenHasInstagramAccess(
          instagramToken?.scopes,
        )}
        initialXConnected={tokenHasXAccess(xToken?.scopes)}
        initialWhatsAppConnected={tokenHasWhatsAppAccess(
          whatsappToken?.scopes,
        )}
        initialTikTokConnected={tokenHasTikTokAccess(tiktokToken?.scopes)}
        initialOutlookCalendarConnected={tokenHasOutlookCalendarAccess(
          outlookToken?.scopes,
        )}
        instagramAppId={instagramAppId}
        xClientId={xClientId}
        whatsappAppId={whatsappAppId}
        tiktokClientKey={tiktokClientKey}
        microsoftClientId={microsoftClientId}
      />
      <RelaySection />
    </>
  );
}
