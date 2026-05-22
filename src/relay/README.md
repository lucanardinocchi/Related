# @related/relay

Mac daemon that wraps [`imsg`](https://github.com/steipete/imsg) to sync Messages.app threads into Related (Supabase) and drain the web outbound queue.

## Requirements

- macOS 14+
- Node.js 18+
- Messages.app signed in (iMessage and/or SMS relay)
- [imsg](https://imsg.sh) installed and on `PATH` (or set `RELATED_IMSG_PATH`)

```bash
brew install steipete/tap/imsg
imsg --version
```

## Permissions

Grant these once in **System Settings → Privacy & Security**:

1. **Full Disk Access** — for the terminal or parent app that runs `related-relay` (and optionally Terminal.app). Required so `imsg` can read `~/Library/Messages/chat.db`.
2. **Automation → Messages** — required for `imsg send` when the web app queues outbound messages.

If reads fail with "unable to open database file" or sends fail silently, toggle the FDA entry off/on after updates.

## Install

From the monorepo root:

```bash
npm install
npm run build --workspace=@related/relay
npm link --workspace=@related/relay   # optional: global `related-relay` CLI
```

Or run directly:

```bash
node src/relay/dist/index.js status
```

## Pairing

1. In the Related web app, open **Settings → Relay** and create a pairing code.
2. On your Mac:

```bash
related-relay pair \
  --code ABCD-1234 \
  --supabase-url https://YOUR_PROJECT.supabase.co \
  --name "Luca's MacBook"
```

This exchanges a random 32-byte device secret with the `relay-pair` edge function and saves `~/.related/relay.json` (mode `0600`).

## Commands

| Command | Description |
|---------|-------------|
| `related-relay pair …` | One-time pairing with a web-generated code |
| `related-relay run` | Start sync daemon in the foreground (debugging) |
| `related-relay install-service` | Install a launchd LaunchAgent for always-on sync |
| `related-relay uninstall-service` | Remove the launchd LaunchAgent |
| `related-relay status` | Show local config, launchd state, and test heartbeat |

### `run` behavior

- **Backfill** on start: `imsg chats --limit 50`, then recent history per chat → `relay-sync`
- **Live sync**: prefers `imsg watch --json`; falls back to polling `imsg history` every 5s
- **Heartbeat**: `relay-sync { heartbeat: true }` every 30s
- **Outbound**: polls `relay-outbound-pull` every 3s, sends via `imsg send`, then `relay-outbound-ack`

All relay API calls send device auth headers:

- `X-Relay-Device-Id`
- `X-Relay-Device-Secret`

## launchd (always-on)

After pairing, install a user LaunchAgent so the relay survives terminal closes and restarts at login:

```bash
related-relay install-service
```

This writes `~/Library/LaunchAgents/com.related.relay.plist`, bootstraps the job, and starts it immediately. Logs go to `/tmp/related-relay.log` and `/tmp/related-relay.err`.

Check status:

```bash
related-relay status
tail -f /tmp/related-relay.log
```

Remove the service:

```bash
related-relay uninstall-service
```

**Note:** launchd jobs still need Full Disk Access and Automation granted to the Node binary (`process.execPath`, often `/opt/homebrew/bin/node` on Apple Silicon). If the daemon cannot read `chat.db`, add that Node path to Full Disk Access.

### Manual plist example

If you prefer to edit the plist by hand, save as `~/Library/LaunchAgents/com.related.relay.plist` (adjust paths):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.related.relay</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOU/Related/src/relay/dist/index.js</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/related-relay.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/related-relay.err</string>
</dict>
</plist>
```

Load and start manually:

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.related.relay.plist
launchctl kickstart -k "gui/$(id -u)/com.related.relay"
tail -f /tmp/related-relay.log
```

Unload manually:

```bash
launchctl bootout "gui/$(id -u)/com.related.relay"
```

Prefer `related-relay install-service` / `uninstall-service` — they handle bootstrap and paths automatically.

## Development

```bash
npm run build --workspace=@related/relay
npm run dev --workspace=@related/relay
```

## Config file

`~/.related/relay.json`:

```json
{
  "supabaseUrl": "https://xxx.supabase.co",
  "deviceId": "uuid",
  "deviceSecret": "64-char hex",
  "ownerId": "uuid",
  "deviceName": "My Mac"
}
```
