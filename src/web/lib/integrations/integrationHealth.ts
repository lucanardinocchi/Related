import {
  isNeedsReconsent,
  tokenHasCalendarAccess,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasOutlookCalendarAccess,
  tokenHasOutlookMailAccess,
  tokenHasTikTokAccess,
  tokenHasWhatsAppAccess,
  tokenHasXAccess,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";

/** Placeholder contact used only to probe token refresh (no messages expected). */
const HEALTH_CHECK_EMAIL = "healthcheck@invalid.related";
const HEALTH_CHECK_CONTACT_ID = "00000000-0000-0000-0000-000000000000";

export type IntegrationHealthFlags = {
  googleCalendar: boolean;
  gmail: boolean;
  outlookCalendar: boolean;
  outlookMail: boolean;
  instagram: boolean;
  x: boolean;
  whatsapp: boolean;
  tiktok: boolean;
};

const EMPTY_HEALTH: IntegrationHealthFlags = {
  googleCalendar: false,
  gmail: false,
  outlookCalendar: false,
  outlookMail: false,
  instagram: false,
  x: false,
  whatsapp: false,
  tiktok: false,
};

/**
 * Probes connected integrations for expired/revoked refresh tokens.
 * Edge Functions return `needs_reconsent` when refresh fails.
 */
export async function probeIntegrationHealth(): Promise<IntegrationHealthFlags> {
  const {
    supabase,
    resolveOwnerId,
    userProviderTokens,
    gmail,
    outlook,
    instagram,
    x,
    whatsapp,
    tiktok,
  } = getBrowserDeps();

  const flags = { ...EMPTY_HEALTH };

  const [googleTok, outlookTok, igTok, xTok, waTok, ttTok] = await Promise.all([
    userProviderTokens.getForProvider("google"),
    userProviderTokens.getForProvider("outlook"),
    userProviderTokens.getForProvider("instagram"),
    userProviderTokens.getForProvider("x"),
    userProviderTokens.getForProvider("whatsapp"),
    userProviderTokens.getForProvider("tiktok"),
  ]);

  const probes: Promise<void>[] = [];

  if (googleTok && tokenHasGmailAccess(googleTok.scopes)) {
    probes.push(
      (async () => {
        const result = await gmail.listForContact({
          contactEmail: HEALTH_CHECK_EMAIL,
          maxResults: 1,
        });
        if (isNeedsReconsent(result.status)) flags.gmail = true;
      })(),
    );
  }

  if (googleTok && tokenHasCalendarAccess(googleTok.scopes)) {
    probes.push(
      (async () => {
        try {
          const ownerId = await resolveOwnerId();
          const { data } = await supabase.functions.invoke("sync-calendar", {
            body: { ownerId },
          });
          const summaries = (data as { summaries?: Array<{ provider?: string; status?: string }> })
            ?.summaries;
          const googleSummary = summaries?.find((s) => s.provider === "google");
          if (isNeedsReconsent(googleSummary?.status)) {
            flags.googleCalendar = true;
          }
        } catch {
          // Ignore probe failures — user can retry from Settings.
        }
      })(),
    );
  }

  if (outlookTok && tokenHasOutlookMailAccess(outlookTok.scopes)) {
    probes.push(
      (async () => {
        const result = await outlook.listForContact({
          contactEmail: HEALTH_CHECK_EMAIL,
          maxResults: 1,
        });
        if (isNeedsReconsent(result.status)) flags.outlookMail = true;
      })(),
    );
  }

  if (outlookTok && tokenHasOutlookCalendarAccess(outlookTok.scopes)) {
    probes.push(
      (async () => {
        try {
          const ownerId = await resolveOwnerId();
          const { data } = await supabase.functions.invoke("sync-calendar", {
            body: { ownerId },
          });
          const summaries = (data as { summaries?: Array<{ provider?: string; status?: string }> })
            ?.summaries;
          const outlookSummary = summaries?.find((s) => s.provider === "outlook");
          if (isNeedsReconsent(outlookSummary?.status)) {
            flags.outlookCalendar = true;
          }
        } catch {
          // Ignore probe failures.
        }
      })(),
    );
  }

  if (igTok && tokenHasInstagramAccess(igTok.scopes)) {
    probes.push(
      (async () => {
        const result = await instagram.listForContact({
          contactId: HEALTH_CHECK_CONTACT_ID,
          maxResults: 1,
        });
        if (isNeedsReconsent(result.status)) flags.instagram = true;
      })(),
    );
  }

  if (xTok && tokenHasXAccess(xTok.scopes)) {
    probes.push(
      (async () => {
        const result = await x.listForContact({
          contactId: HEALTH_CHECK_CONTACT_ID,
          maxResults: 1,
        });
        if (isNeedsReconsent(result.status)) flags.x = true;
      })(),
    );
  }

  if (waTok && tokenHasWhatsAppAccess(waTok.scopes)) {
    probes.push(
      (async () => {
        const result = await whatsapp.listForContact({
          contactId: HEALTH_CHECK_CONTACT_ID,
          maxResults: 1,
        });
        if (isNeedsReconsent(result.status)) flags.whatsapp = true;
      })(),
    );
  }

  if (ttTok && tokenHasTikTokAccess(ttTok.scopes)) {
    probes.push(
      (async () => {
        const result = await tiktok.listForContact({
          contactId: HEALTH_CHECK_CONTACT_ID,
          maxResults: 1,
        });
        if (isNeedsReconsent(result.status)) flags.tiktok = true;
      })(),
    );
  }

  await Promise.allSettled(probes);
  return flags;
}
