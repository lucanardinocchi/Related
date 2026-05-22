import type { SupabaseClient } from "@supabase/supabase-js";
import { CommsPlatformMessagesClient } from "./CommsPlatformMessagesClient";

function withClient() {
  const order = jest.fn().mockResolvedValue({
    data: [
      { contact_id: "c-sam", sent_at: "2026-05-20T10:00:00Z" },
      { contact_id: "c-sam", sent_at: "2026-05-19T09:00:00Z" },
    ],
    error: null,
  });
  const select = jest.fn(() => ({ order }));
  const from = jest.fn(() => ({ select }));
  const supa = { from } as unknown as SupabaseClient;
  return { from, select, order, client: new CommsPlatformMessagesClient(supa) };
}

describe("CommsPlatformMessagesClient.listForUser", () => {
  it("returns contact id and sent_at for each cached platform message", async () => {
    const { from, select, order, client } = withClient();
    const rows = await client.listForUser();

    expect(from).toHaveBeenCalledWith("comms_platform_messages");
    expect(select).toHaveBeenCalledWith("contact_id, sent_at");
    expect(order).toHaveBeenCalledWith("sent_at", { ascending: false });
    expect(rows).toEqual([
      { contactId: "c-sam", sentAt: "2026-05-20T10:00:00Z" },
      { contactId: "c-sam", sentAt: "2026-05-19T09:00:00Z" },
    ]);
  });
});
