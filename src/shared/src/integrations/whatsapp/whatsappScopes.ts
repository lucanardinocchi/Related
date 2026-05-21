/**
 * Meta WhatsApp Business Cloud API OAuth scopes.
 * Stored verbatim on user_provider_tokens.scopes after connect.
 */

export const WHATSAPP_SCOPE_BUSINESS_MANAGEMENT = "whatsapp_business_management";
export const WHATSAPP_SCOPE_BUSINESS_MESSAGING = "whatsapp_business_messaging";
export const WHATSAPP_SCOPE_BUSINESS_MANAGEMENT_ALT = "business_management";

export const WHATSAPP_INTEGRATION_SCOPES = [
  WHATSAPP_SCOPE_BUSINESS_MANAGEMENT,
  WHATSAPP_SCOPE_BUSINESS_MESSAGING,
  WHATSAPP_SCOPE_BUSINESS_MANAGEMENT_ALT,
].join(",");

export function tokenHasWhatsAppAccess(
  scopes: string | null | undefined,
): boolean {
  if (!scopes) return false;
  return (
    scopes.includes(WHATSAPP_SCOPE_BUSINESS_MESSAGING) &&
    (scopes.includes(WHATSAPP_SCOPE_BUSINESS_MANAGEMENT) ||
      scopes.includes(WHATSAPP_SCOPE_BUSINESS_MANAGEMENT_ALT))
  );
}
