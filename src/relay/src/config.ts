import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface RelayConfig {
  supabaseUrl: string;
  deviceId: string;
  deviceSecret: string;
  ownerId: string;
  deviceName: string;
}

const CONFIG_DIR = join(homedir(), ".related");
const CONFIG_PATH = join(CONFIG_DIR, "relay.json");

export function configPath(): string {
  return CONFIG_PATH;
}

export async function loadConfig(): Promise<RelayConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as RelayConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function saveConfig(config: RelayConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

export function requireConfig(config: RelayConfig | null): RelayConfig {
  if (!config) {
    throw new Error(
      `Not paired. Run: related-relay pair --code XXXX-XXXX --supabase-url URL --name "My Mac"`,
    );
  }
  return config;
}
