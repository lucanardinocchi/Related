import { buildRelaySetupPrompt } from "./relaySetupPrompt";

describe("buildRelaySetupPrompt", () => {
  it("includes pairing credentials and setup steps", () => {
    const prompt = buildRelaySetupPrompt({
      pairingCode: "AB3K9XYZ",
      supabaseUrl: "https://abc.supabase.co/",
      expiresAt: "2026-05-22T12:10:00.000Z",
    });

    expect(prompt).toContain("Pairing code: AB3K9XYZ");
    expect(prompt).toContain("Supabase URL: https://abc.supabase.co");
    expect(prompt).toContain("Code expires: 2026-05-22T12:10:00.000Z");
    expect(prompt).toContain("--code AB3K9XYZ");
    expect(prompt).toContain("brew install steipete/tap/imsg");
    expect(prompt).toContain("node src/relay/dist/index.js pair");
    expect(prompt).toContain("node src/relay/dist/index.js run");
    expect(prompt).toContain("node src/relay/dist/index.js status");
    expect(prompt).toContain("Full Disk Access");
  });

  it("uses a custom repo URL when provided", () => {
    const prompt = buildRelaySetupPrompt({
      pairingCode: "TEST1234",
      supabaseUrl: "https://abc.supabase.co",
      expiresAt: "2026-05-22T12:10:00.000Z",
      repoUrl: "https://github.com/example/Related",
    });

    expect(prompt).toContain("https://github.com/example/Related");
  });
});
