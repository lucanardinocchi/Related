import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageChannel } from "../ambientTools";

export interface ContactAddresses {
  phone: string | null;
  email: string | null;
}

/** Resolve `to` addresses for a single Contact from channel + stored fields. */
export function resolveSendMessageRecipients(
  addresses: ContactAddresses,
  channel: MessageChannel | string | undefined,
): string[] {
  if (channel === "email" && addresses.email) return [addresses.email];
  if (channel === "text" && addresses.phone) return [addresses.phone];
  return [];
}

/**
 * Ensure SendMessage has resolved recipient addresses. Uses explicit `to`
 * from the merged payload when present; otherwise looks up Contacts by id.
 */
export async function ensureSendMessageRecipients(
  supabase: SupabaseClient,
  input: {
    to?: string[];
    contactIds: string[];
    channel: MessageChannel;
  },
): Promise<string[]> {
  if (input.to && input.to.length > 0) return input.to;

  const { data, error } = await supabase
    .from("contacts")
    .select("id, phone, email")
    .in("id", input.contactIds);
  if (error) throw error;

  const rows = (data ?? []) as ContactAddresses[];
  return rows.flatMap((row) =>
    resolveSendMessageRecipients(row, input.channel),
  );
}
