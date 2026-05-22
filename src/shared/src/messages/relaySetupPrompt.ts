export interface RelaySetupPromptInput {
  pairingCode: string;
  supabaseUrl: string;
  expiresAt: string;
  repoUrl?: string;
}

/**
 * Self-contained prompt for Claude Code, Cursor, or similar tools to pair
 * and run the Mac Messages relay on the user's machine.
 */
export function buildRelaySetupPrompt(input: RelaySetupPromptInput): string {
  const repoUrl = input.repoUrl ?? "https://github.com/lucanardinocchi/Related";
  const supabaseUrl = input.supabaseUrl.replace(/\/+$/, "");

  return `Set up the Related Mac Messages relay on this Mac.

Related syncs SMS and iMessage from Messages.app into the Related web app, and sends outbound messages queued from the web. You are pairing this Mac with my Related account.

Pairing credentials (use exactly):
- Pairing code: ${input.pairingCode}
- Supabase URL: ${supabaseUrl}
- Code expires: ${input.expiresAt}

Do this end-to-end on macOS:

1. Verify prerequisites: macOS 14+, Node.js 18+, Messages.app signed in, Homebrew available.
2. Install imsg: \`brew install steipete/tap/imsg\` and confirm \`imsg --version\` works.
3. Get the relay CLI:
   - If the Related repo is already on this machine, use that checkout.
   - Otherwise clone ${repoUrl}, then from the repo root run \`npm install\` and \`npm run build --workspace=@related/relay\`.
4. Pair this Mac (pick a device name from the hostname or Computer Name):
   \`node src/relay/dist/index.js pair --code ${input.pairingCode} --supabase-url ${supabaseUrl} --name "<device name>"\`
   Config is saved to ~/.related/relay.json.
5. Grant macOS permissions if needed:
   - System Settings → Privacy & Security → Full Disk Access for Terminal (or the app running Node).
   - System Settings → Privacy & Security → Automation → allow Messages for that same process.
   Required so imsg can read ~/Library/Messages/chat.db and send messages.
6. Start the relay daemon:
   \`node src/relay/dist/index.js run\`
   Leave it running, or create a launchd LaunchAgent for always-on sync (see src/relay/README.md in the repo).
7. Verify:
   - \`node src/relay/dist/index.js status\` should report heartbeat ok.
   - Tell me to refresh Settings → Mac Messages relay in the Related web app — status should show Online within 90 seconds.

If anything fails, diagnose and fix. Do not skip permission steps.`;
}
