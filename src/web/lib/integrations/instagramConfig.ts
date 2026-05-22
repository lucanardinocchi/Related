/**
 * Instagram Login uses a platform-specific App ID from Meta Developer Console
 * (Instagram → API setup with Instagram login). It is not the Facebook App ID
 * shown under App settings → Basic (used for WhatsApp / Facebook Login).
 */

export const INSTAGRAM_APP_ID_MISCONFIG_MESSAGE =
  "Instagram App ID is set to your Meta/Facebook App ID (same as WhatsApp). " +
  "Instagram Login requires the separate Instagram App ID from Meta Developer Console → " +
  "Instagram → API setup with Instagram login. Copy that ID into NEXT_PUBLIC_INSTAGRAM_APP_ID " +
  "and INSTAGRAM_APP_ID (Supabase secret), and the matching Instagram App Secret into " +
  "INSTAGRAM_APP_SECRET. See docs/MESSAGING_INTEGRATIONS.md §3.";

export function resolveInstagramAppId(): string | null {
  const serverId = process.env.INSTAGRAM_APP_ID?.trim();
  if (serverId) return serverId;
  const publicId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID?.trim();
  return publicId || null;
}

export function isInstagramAppIdMisconfigured(
  instagramAppId: string | null | undefined,
  whatsappAppId: string | null | undefined,
): boolean {
  if (!instagramAppId || !whatsappAppId) return false;
  return instagramAppId.trim() === whatsappAppId.trim();
}

export function assertInstagramAppIdConfigured(
  instagramAppId: string | null | undefined,
  whatsappAppId: string | null | undefined,
): asserts instagramAppId is string {
  if (!instagramAppId?.trim()) {
    throw new Error(
      "Instagram is not configured. Set NEXT_PUBLIC_INSTAGRAM_APP_ID (see docs/MESSAGING_INTEGRATIONS.md).",
    );
  }
  if (isInstagramAppIdMisconfigured(instagramAppId, whatsappAppId)) {
    throw new Error(INSTAGRAM_APP_ID_MISCONFIG_MESSAGE);
  }
}
