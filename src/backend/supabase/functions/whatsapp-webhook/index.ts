// whatsapp-webhook Edge Function — Meta webhook verification + inbound message
// storage in whatsapp_messages.
//
// Deploy:
//   supabase secrets set WHATSAPP_VERIFY_TOKEN=...
//   supabase functions deploy whatsapp-webhook --no-verify-jwt
//
// Configure in Meta Developer Console:
//   Callback URL: https://<ref>.supabase.co/functions/v1/whatsapp-webhook
//   Verify token: same as WHATSAPP_VERIFY_TOKEN secret
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

function normalizePhoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

async function findOwnerIdForPhoneNumberId(
  supabase: any,
  phoneNumberId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_provider_tokens")
    .select("owner_id")
    .eq("provider", "whatsapp")
    .eq("provider_account_id", phoneNumberId)
    .maybeSingle();
  if (error || !data) return null;
  return data.owner_id as string;
}

async function findContactByPhone(
  supabase: any,
  ownerId: string,
  fromPhone: string,
): Promise<{ id: string; whatsapp_wa_id: string | null } | null> {
  const fromDigits = normalizePhoneDigits(fromPhone);
  if (!fromDigits) return null;

  const { data, error } = await supabase
    .from("contacts")
    .select("id, phone, whatsapp_wa_id")
    .eq("owner_id", ownerId);

  if (error || !data) return null;

  for (const row of data as Array<{
    id: string;
    phone: string | null;
    whatsapp_wa_id: string | null;
  }>) {
    const phoneDigits = normalizePhoneDigits(row.phone);
    const waDigits = normalizePhoneDigits(row.whatsapp_wa_id);
    if (
      phoneDigits === fromDigits ||
      waDigits === fromDigits ||
      phoneDigits.endsWith(fromDigits) ||
      fromDigits.endsWith(phoneDigits)
    ) {
      return { id: row.id, whatsapp_wa_id: row.whatsapp_wa_id };
    }
  }

  return null;
}

async function findGroupByWhatsAppGroupId(
  supabase: any,
  ownerId: string,
  whatsappGroupId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("groups")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("whatsapp_group_id", whatsappGroupId)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

async function maybeLinkGroupFromInbound(
  supabase: any,
  ownerId: string,
  whatsappGroupId: string,
  fromPhone: string,
): Promise<string | null> {
  const existing = await findGroupByWhatsAppGroupId(
    supabase,
    ownerId,
    whatsappGroupId,
  );
  if (existing) return existing;

  const contact = await findContactByPhone(supabase, ownerId, fromPhone);
  if (!contact) return null;

  const { data: memberships, error } = await supabase
    .from("contact_groups")
    .select("group_id, groups!inner(id, whatsapp_group_id)")
    .eq("contact_id", contact.id);

  if (error || !memberships || memberships.length !== 1) return null;

  const groupId = (memberships[0] as { group_id: string }).group_id;
  await supabase
    .from("groups")
    .update({
      whatsapp_group_id: whatsappGroupId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId)
    .eq("owner_id", ownerId);

  return groupId;
}

async function storeInboundMessage(
  supabase: any,
  input: {
    ownerId: string;
    waMessageId: string;
    fromPhone: string;
    fromName: string | null;
    text: string;
    sentAt: string;
    whatsappGroupId: string | null;
    contactId: string | null;
    groupId: string | null;
  },
): Promise<void> {
  await supabase.from("whatsapp_messages").upsert(
    {
      owner_id: input.ownerId,
      contact_id: input.contactId,
      group_id: input.groupId,
      wa_message_id: input.waMessageId,
      direction: "inbound",
      from_phone: input.fromPhone,
      from_name: input.fromName,
      text: input.text,
      sent_at: input.sentAt,
      whatsapp_group_id: input.whatsappGroupId,
    },
    { onConflict: "owner_id,wa_message_id" },
  );

  if (input.contactId && input.fromPhone) {
    const waId = normalizePhoneDigits(input.fromPhone);
    if (waId) {
      await supabase
        .from("contacts")
        .update({
          whatsapp_wa_id: waId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.contactId)
        .eq("owner_id", input.ownerId)
        .is("whatsapp_wa_id", null);
    }
  }
}

async function handleWebhookPayload(
  supabase: any,
  payload: Record<string, unknown>,
): Promise<void> {
  const entries = (payload.entry ?? []) as Array<Record<string, unknown>>;
  for (const entry of entries) {
    const changes = (entry.changes ?? []) as Array<Record<string, unknown>>;
    for (const change of changes) {
      const value = (change.value ?? {}) as Record<string, unknown>;
      const metadata = (value.metadata ?? {}) as Record<string, unknown>;
      const phoneNumberId = metadata.phone_number_id as string | undefined;
      if (!phoneNumberId) continue;

      const ownerId = await findOwnerIdForPhoneNumberId(
        supabase,
        phoneNumberId,
      );
      if (!ownerId) continue;

      const contacts = (value.contacts ?? []) as Array<{
        wa_id?: string;
        profile?: { name?: string };
      }>;
      const contactNameByWaId = new Map(
        contacts.map((c) => [c.wa_id ?? "", c.profile?.name ?? null]),
      );

      const messages = (value.messages ?? []) as Array<{
        id: string;
        from: string;
        timestamp: string;
        type?: string;
        text?: { body?: string };
        context?: { group_id?: string };
      }>;

      for (const message of messages) {
        if (message.type !== "text" || !message.text?.body) continue;

        const fromPhone = message.from;
        const whatsappGroupId = message.context?.group_id ?? null;
        const sentAt = new Date(Number(message.timestamp) * 1000).toISOString();
        const fromName = contactNameByWaId.get(fromPhone) ?? null;

        let contactId: string | null = null;
        let groupId: string | null = null;

        if (whatsappGroupId) {
          groupId = await maybeLinkGroupFromInbound(
            supabase,
            ownerId,
            whatsappGroupId,
            fromPhone,
          );
          contactId = groupId
            ? null
            : (await findContactByPhone(supabase, ownerId, fromPhone))?.id ??
              null;
        } else {
          contactId =
            (await findContactByPhone(supabase, ownerId, fromPhone))?.id ??
            null;
        }

        await storeInboundMessage(supabase, {
          ownerId,
          waMessageId: message.id,
          fromPhone,
          fromName,
          text: message.text.body,
          sentAt,
          whatsappGroupId,
          contactId,
          groupId,
        });
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (
      mode === "subscribe" &&
      token === VERIFY_TOKEN &&
      challenge
    ) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const adminClient = createClient(
    SUPABASE_URL ?? "",
    SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const payload = await req.json();
    if (payload.object === "whatsapp_business_account") {
      await handleWebhookPayload(adminClient, payload);
    }
    return new Response("OK", { status: 200 });
  } catch {
    return new Response("OK", { status: 200 });
  }
});
