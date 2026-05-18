import { SystemLinkingComposer } from "./SystemLinkingComposer";

describe("SystemLinkingComposer.compose — URL building", () => {
  it("builds an sms: URL with semicolon-separated recipients and an encoded body", async () => {
    const open = jest.fn().mockResolvedValue(undefined);
    const composer = new SystemLinkingComposer({ openURL: open });

    await composer.compose({
      channel: "text",
      to: ["+61 400 000 000", "+61 411 111 111"],
      body: "Hey Sam, coffee Friday? 🤝",
    });

    expect(open).toHaveBeenCalledTimes(1);
    const url = open.mock.calls[0][0] as string;
    expect(url.startsWith("sms:")).toBe(true);
    expect(url).toContain("+61400000000");
    expect(url).toContain("+61411111111");
    expect(url).toContain(encodeURIComponent("Hey Sam, coffee Friday? 🤝"));
    expect(url).toContain("body=");
  });

  it("builds a mailto: URL with subject + body when channel='email'", async () => {
    const open = jest.fn().mockResolvedValue(undefined);
    const composer = new SystemLinkingComposer({ openURL: open });

    await composer.compose({
      channel: "email",
      to: ["sam@example.com", "jules@example.com"],
      subject: "Coffee Friday?",
      body: "Free Friday morning?",
    });

    const url = open.mock.calls[0][0] as string;
    expect(url.startsWith("mailto:sam@example.com,jules@example.com?")).toBe(true);
    expect(url).toContain("subject=" + encodeURIComponent("Coffee Friday?"));
    expect(url).toContain("body=" + encodeURIComponent("Free Friday morning?"));
  });

  it("strips spaces from phone numbers (sms: rejects whitespace on iOS)", async () => {
    const open = jest.fn().mockResolvedValue(undefined);
    const composer = new SystemLinkingComposer({ openURL: open });

    await composer.compose({
      channel: "text",
      to: ["+61 400 000 000"],
      body: "x",
    });

    const url = open.mock.calls[0][0] as string;
    expect(url).toContain("+61400000000");
    expect(url).not.toContain("+61 400");
  });

  it("throws when channel is email but no recipients", async () => {
    const open = jest.fn().mockResolvedValue(undefined);
    const composer = new SystemLinkingComposer({ openURL: open });

    await expect(
      composer.compose({ channel: "email", to: [], body: "x" }),
    ).rejects.toThrow(/at least one recipient/i);
    expect(open).not.toHaveBeenCalled();
  });
});
