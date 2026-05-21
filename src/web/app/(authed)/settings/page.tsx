import {
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
} from "@related/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { getServerDeps } from "@/lib/deps/server";
import { IntegrationsSection } from "./_IntegrationsSection";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userProviderTokens } = await getServerDeps();
  const token = await userProviderTokens.getForProvider("google");

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Connect external accounts and manage integrations."
      />
      <IntegrationsSection
        initialCalendarConnected={tokenHasCalendarAccess(token?.scopes)}
        initialGmailConnected={tokenHasGmailAccess(token?.scopes)}
      />
    </>
  );
}
