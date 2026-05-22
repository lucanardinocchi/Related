import {
  resolveSendMessageRecipients,
} from "./sendMessageRecipients";

describe("resolveSendMessageRecipients", () => {
  it("returns phone for text channel", () => {
    expect(
      resolveSendMessageRecipients(
        { phone: "+61400000000", email: "sam@example.com" },
        "text",
      ),
    ).toEqual(["+61400000000"]);
  });

  it("returns email for email channel", () => {
    expect(
      resolveSendMessageRecipients(
        { phone: "+61400000000", email: "sam@example.com" },
        "email",
      ),
    ).toEqual(["sam@example.com"]);
  });

  it("returns empty when the channel address is missing", () => {
    expect(
      resolveSendMessageRecipients({ phone: null, email: null }, "text"),
    ).toEqual([]);
  });
});
