import {
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasXAccess,
  tokenHasWhatsAppAccess,
  tokenHasTikTokAccess,
  tokenHasOutlookCalendarAccess,
  tokenHasOutlookMailAccess,
} from "@related/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { getServerDeps } from "@/lib/deps/server";
import { BillingSection } from "./_BillingSection";
import { AmbientIntelligenceSection } from "./_AmbientIntelligenceSection";
import { IntegrationsSection } from "./_IntegrationsSection";
import { PocketSection } from "./_PocketSection";
import { RelaySection } from "./_RelaySection";
import { McpSection } from "./_McpSection";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, userProviderTokens, subscriptions, pocket, ambientIntelligencePreferences } =
    await getServerDeps();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const subscription = await subscriptions.getState();
  const ambientPrefs = await ambientIntelligencePreferences.getPreferences();
  const googleToken = await userProviderTokens.getForProvider("google");
  const instagramToken = await userProviderTokens.getForProvider("instagram");
  const xToken = await userProviderTokens.getForProvider("x");
  const whatsappToken = await userProviderTokens.getForProvider("whatsapp");
  const tiktokToken = await userProviderTokens.getForProvider("tiktok");
  const outlookToken = await userProviderTokens.getForProvider("outlook");
  const pocketStatus = await pocket.getStatus();
  const pocketAmbiguities = pocketStatus.connected
    ? await pocket.listPendingAmbiguities()
    : [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const pocketWebhookUrl = supabaseUrl
    ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/pocket-webhook`
    : null;
  const instagramAppId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID ?? null;
  const xClientId = process.env.NEXT_PUBLIC_X_CLIENT_ID ?? null;
  const whatsappAppId = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID ?? null;
  const tiktokClientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY ?? null;
  const microsoftClientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ?? null;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Subscription, integrations, account connections, and Mac relay."
      />
      <BillingSection
        initialIsActive={subscription.isActive}
        initialStatus={subscription.status}
        initialCurrentPeriodEnd={subscription.currentPeriodEnd}
        initialCancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
        initialHasCustomer={subscription.stripeCustomerId !== null}
        accountCreatedAt={user?.created_at ?? null}
      />
      <AmbientIntelligenceSection
        initialEnabled={ambientPrefs?.enabled ?? true}
        initialIsSubscribed={subscription.isActive}
        accountCreatedAt={user?.created_at ?? null}
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
        initialOutlookMailConnected={tokenHasOutlookMailAccess(
          outlookToken?.scopes,
        )}
        instagramAppId={instagramAppId}
        xClientId={xClientId}
        whatsappAppId={whatsappAppId}
        tiktokClientKey={tiktokClientKey}
        microsoftClientId={microsoftClientId}
      />
      <PocketSection
        webhookUrl={pocketWebhookUrl}
        initialConnected={pocketStatus.connected}
        initialAccountDisplayName={pocketStatus.accountDisplayName}
        initialConnectedAt={pocketStatus.connectedAt}
        initialLastSyncedAt={pocketStatus.lastSyncedAt}
        initialImportCount={pocketStatus.importCount}
        initialHasWebhookSecret={pocketStatus.hasWebhookSecret}
        initialAmbiguities={pocketAmbiguities}
      />
      <RelaySection />
      <McpSection />
    </>
  );
}
