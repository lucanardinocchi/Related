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
5. Install a persistent launchd service (starts at login, restarts on crash):
   \`node src/relay/dist/index.js install-service\`
   This writes ~/Library/LaunchAgents/com.related.relay.plist and starts the daemon immediately.
6. Grant macOS permissions — required for imsg to read ~/Library/Messages/chat.db and send messages:
   - After install-service, note the Node path it prints (e.g. \`/opt/homebrew/Cellar/node/.../bin/node\`).
   - System Settings → Privacy & Security → Full Disk Access → add that exact Node binary.
   - System Settings → Privacy & Security → Automation → allow Messages for that same Node binary.
   - During setup you may also grant Full Disk Access to Terminal or Cursor so imsg works in the shell; the launchd service uses the Node binary directly, so that Node path is what must stay allowed for always-on sync.
7. Verify:
   - \`node src/relay/dist/index.js status\` should report LaunchAgent loaded and heartbeat ok.
   - \`tail /tmp/related-relay.err\` should not show imsg permission errors.
   - Tell me to refresh Settings → Mac Messages relay in the Related web app — status should show Online within 90 seconds.

If anything fails, diagnose and fix. Do not skip permission steps or fall back to \`run\` in a terminal — use install-service so sync survives logout and sleep.`;
}
