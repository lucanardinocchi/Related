/** Integrations shown in UI but not yet available to connect. */
export type ComingSoonIntegration = "whatsapp" | "tiktok";

const COMING_SOON: Record<ComingSoonIntegration, true> = {
  whatsapp: true,
  tiktok: true,
};

export function isIntegrationComingSoon(
  platform: ComingSoonIntegration,
): boolean {
  return COMING_SOON[platform] === true;
}
