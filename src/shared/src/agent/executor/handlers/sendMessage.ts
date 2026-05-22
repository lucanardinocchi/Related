import type { SendMessagePayload } from "../../Executor";
import { mergePayload } from "../mergePayload";
import { ensureSendMessageRecipients } from "../sendMessageRecipients";
import type { ActionHandler } from "../types";

export const sendMessageHandler: ActionHandler = async (
  action,
  userEdits,
  { supabase, messageComposer },
) => {
  if (!messageComposer) {
    throw new Error(
      "Executor: SendMessage requires a MessageComposer in ExecutorOptions",
    );
  }

  const merged = mergePayload<SendMessagePayload>(action.payload, userEdits?.payload);
  const to = await ensureSendMessageRecipients(supabase, {
    to: merged.to,
    contactIds: merged.contactIds,
    channel: merged.channel,
  });

  await messageComposer.compose({
    channel: merged.channel,
    to,
    subject: merged.subject,
    body: merged.body,
  });

  const { data: interactionId, error: logErr } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: unknown,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("create_interaction", {
    p_time: new Date().toISOString(),
    p_kind: merged.channel,
    p_notes: merged.body,
    p_status: "occurred",
    p_contact_ids: merged.contactIds,
  });
  if (logErr) throw logErr;

  return {
    decisionState: "picked",
    mergedPayload: { ...merged, to },
    effects: { interactionId: (interactionId as string) ?? undefined },
  };
};
