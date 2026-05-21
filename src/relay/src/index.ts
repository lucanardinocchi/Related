#!/usr/bin/env node

import {
  configPath,
  loadConfig,
  requireConfig,
  saveConfig,
} from "./config.js";
import {
  fetchHistory,
  listChats,
  probeWatch,
  watchMessages,
  type ImsgMessage,
} from "./imsg.js";
import { drainOutbound } from "./outbound.js";
import {
  generateDeviceSecret,
  mapChatToThread,
  mapMessageToPayload,
  mapMessages,
  pairExchange,
  sendHeartbeat,
  syncThreadsAndMessages,
} from "./sync.js";

const HEARTBEAT_MS = 30_000;
const OUTBOUND_POLL_MS = 3_000;
const HISTORY_POLL_MS = 5_000;

interface ParsedArgs {
  command?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
      continue;
    }

    if (!command) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function cmdPair(flags: Record<string, string | boolean>): Promise<void> {
  const code = flagString(flags, "code");
  const supabaseUrl = flagString(flags, "supabase-url");
  const name = flagString(flags, "name") ?? "Mac";

  if (!code || !supabaseUrl) {
    throw new Error(
      'Usage: related-relay pair --code XXXX-XXXX --supabase-url URL [--name "My Mac"]',
    );
  }

  const deviceSecret = generateDeviceSecret();
  const { deviceId, ownerId } = await pairExchange({
    supabaseUrl,
    code,
    deviceName: name,
    deviceSecret,
  });

  await saveConfig({
    supabaseUrl,
    deviceId,
    deviceSecret,
    ownerId,
    deviceName: name,
  });

  log(`Paired as ${name} (${deviceId})`);
  log(`Config saved to ${configPath()}`);
}

async function backfill(config: ReturnType<typeof requireConfig>): Promise<void> {
  log("Backfilling recent chats...");
  const chats = await listChats(50);
  const threads = chats.map(mapChatToThread);
  const allMessages = [];

  for (const chat of chats) {
    const history = await fetchHistory(chat.id, 50);
    allMessages.push(...mapMessages(history));
  }

  const result = await syncThreadsAndMessages(config, threads, allMessages);
  log(
    `Backfill complete: ${threads.length} threads, ${allMessages.length} messages` +
      (result.linked !== undefined ? `, ${result.linked} linked` : ""),
  );
}

async function handleIncomingMessage(
  config: ReturnType<typeof requireConfig>,
  message: ImsgMessage,
): Promise<void> {
  const payload = mapMessageToPayload(message);
  if (!payload) {
    return;
  }

  await syncThreadsAndMessages(config, [], [payload]);
}

async function startWatchLoop(config: ReturnType<typeof requireConfig>): Promise<() => void> {
  log("Starting imsg watch...");
  return watchMessages(
    (message) => {
      void handleIncomingMessage(config, message).catch((err) => {
        log(`Sync error: ${err instanceof Error ? err.message : String(err)}`);
      });
    },
    (err) => {
      log(`Watch error: ${err.message}`);
    },
  );
}

async function startHistoryPollLoop(
  config: ReturnType<typeof requireConfig>,
): Promise<() => void> {
  log("Watch unavailable; polling imsg history every 5s...");
  const seen = new Set<string>();
  let chatIds: number[] = [];

  const refreshChats = async () => {
    const chats = await listChats(50);
    chatIds = chats.map((chat) => chat.id);
    await syncThreadsAndMessages(config, chats.map(mapChatToThread), []);
  };

  await refreshChats();

  const timer = setInterval(() => {
    void (async () => {
      try {
        const batch = [];
        for (const chatId of chatIds) {
          const history = await fetchHistory(chatId, 20);
          for (const message of history) {
            const payload = mapMessageToPayload(message);
            if (!payload || seen.has(payload.externalMessageId)) {
              continue;
            }
            seen.add(payload.externalMessageId);
            batch.push(payload);
          }
        }
        if (batch.length > 0) {
          await syncThreadsAndMessages(config, [], batch);
          log(`Synced ${batch.length} message(s) from history poll`);
        }
      } catch (err) {
        log(`History poll error: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  }, HISTORY_POLL_MS);

  const chatRefreshTimer = setInterval(() => {
    void refreshChats().catch((err) => {
      log(`Chat refresh error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, HEARTBEAT_MS);

  return () => {
    clearInterval(timer);
    clearInterval(chatRefreshTimer);
  };
}

async function cmdRun(): Promise<void> {
  const config = requireConfig(await loadConfig());
  log(`Running relay for ${config.deviceName} (${config.deviceId})`);

  await backfill(config);

  const watchAvailable = await probeWatch();
  const stopWatch = watchAvailable
    ? await startWatchLoop(config)
    : await startHistoryPollLoop(config);

  const heartbeatTimer = setInterval(() => {
    void sendHeartbeat(config).catch((err) => {
      log(`Heartbeat error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, HEARTBEAT_MS);

  const outboundTimer = setInterval(() => {
    void drainOutbound(config).catch((err) => {
      log(`Outbound error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, OUTBOUND_POLL_MS);

  void sendHeartbeat(config).catch((err) => {
    log(`Initial heartbeat error: ${err instanceof Error ? err.message : String(err)}`);
  });
  void drainOutbound(config).catch((err) => {
    log(`Initial outbound error: ${err instanceof Error ? err.message : String(err)}`);
  });

  const shutdown = () => {
    log("Shutting down...");
    clearInterval(heartbeatTimer);
    clearInterval(outboundTimer);
    stopWatch();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log("Relay running. Press Ctrl+C to stop.");
  await new Promise<void>(() => {});
}

async function cmdStatus(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    log("Status: not paired");
    return;
  }

  log(`Device: ${config.deviceName} (${config.deviceId})`);
  log(`Owner: ${config.ownerId}`);
  log(`Supabase: ${config.supabaseUrl}`);
  log(`Config: ${configPath()}`);

  try {
    await sendHeartbeat(config);
    log("Heartbeat: ok");
  } catch (err) {
    log(`Heartbeat: failed (${err instanceof Error ? err.message : String(err)})`);
  }
}

function printHelp(): void {
  process.stdout.write(`related-relay — sync Messages.app to Related via imsg

Usage:
  related-relay pair --code XXXX-XXXX --supabase-url URL [--name "My Mac"]
  related-relay run
  related-relay status

Environment:
  RELATED_IMSG_PATH   Path to imsg binary (default: imsg on PATH)
`);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || flags.help) {
    printHelp();
    return;
  }

  switch (command) {
    case "pair":
      await cmdPair(flags);
      return;
    case "run":
      await cmdRun();
      return;
    case "status":
      await cmdStatus();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
