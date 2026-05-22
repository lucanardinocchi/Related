import { execFile } from "node:child_process";
import { unlink, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const LAUNCH_AGENT_LABEL = "com.related.relay";
export const LAUNCH_AGENT_PATH = join(
  homedir(),
  "Library",
  "LaunchAgents",
  `${LAUNCH_AGENT_LABEL}.plist`,
);
export const LAUNCH_AGENT_LOG_PATH = "/tmp/related-relay.log";
export const LAUNCH_AGENT_ERR_PATH = "/tmp/related-relay.err";

function launchAgentTarget(): string {
  const uid = process.getuid?.();
  if (uid === undefined) {
    throw new Error("launchd services are only supported on macOS");
  }
  return `gui/${uid}`;
}

export function launchAgentServiceId(): string {
  return `${launchAgentTarget()}/${LAUNCH_AGENT_LABEL}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildLaunchAgentPlist(nodePath: string, scriptPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(scriptPath)}</string>
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
  <string>${LAUNCH_AGENT_LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${LAUNCH_AGENT_ERR_PATH}</string>
</dict>
</plist>
`;
}

export async function isLaunchAgentLoaded(): Promise<boolean> {
  try {
    await execFileAsync("launchctl", ["print", launchAgentServiceId()]);
    return true;
  } catch {
    return false;
  }
}

async function bootoutLaunchAgent(): Promise<void> {
  try {
    await execFileAsync("launchctl", ["bootout", launchAgentServiceId()]);
    return;
  } catch {
    await execFileAsync("launchctl", ["bootout", launchAgentTarget(), LAUNCH_AGENT_PATH]);
  }
}

export async function installLaunchAgent(
  nodePath: string,
  scriptPath: string,
): Promise<void> {
  await mkdir(join(homedir(), "Library", "LaunchAgents"), { recursive: true });

  if (await isLaunchAgentLoaded()) {
    await bootoutLaunchAgent();
  }

  await writeFile(
    LAUNCH_AGENT_PATH,
    buildLaunchAgentPlist(nodePath, scriptPath),
    "utf8",
  );

  await execFileAsync("launchctl", ["bootstrap", launchAgentTarget(), LAUNCH_AGENT_PATH]);
  await execFileAsync("launchctl", ["kickstart", "-k", launchAgentServiceId()]);
}

export async function uninstallLaunchAgent(): Promise<void> {
  if (await isLaunchAgentLoaded()) {
    await bootoutLaunchAgent();
  }

  try {
    await unlink(LAUNCH_AGENT_PATH);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}
