import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface ImsgChat {
  id: number;
  name?: string;
  identifier?: string;
  guid?: string;
  service?: string;
  last_message_at?: string;
  display_name?: string;
  is_group?: boolean;
  participants?: string[];
}

export interface ImsgMessage {
  id?: number;
  chat_id?: number;
  chat_identifier?: string;
  chat_guid?: string;
  guid?: string;
  sender?: string;
  is_from_me?: boolean;
  text?: string;
  created_at?: string;
  service?: string;
}

function imsgPath(): string {
  return process.env.RELATED_IMSG_PATH?.trim() || "imsg";
}

function runImsg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(imsgPath(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `imsg ${args.join(" ")} exited ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

function parseNdjson<T>(stdout: string): T[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export async function listChats(limit = 50): Promise<ImsgChat[]> {
  const { stdout } = await runImsg(["chats", "--limit", String(limit), "--json"]);
  return parseNdjson<ImsgChat>(stdout);
}

export async function fetchHistory(
  chatId: number,
  limit = 50,
): Promise<ImsgMessage[]> {
  const { stdout } = await runImsg([
    "history",
    "--chat-id",
    String(chatId),
    "--limit",
    String(limit),
    "--json",
  ]);
  return parseNdjson<ImsgMessage>(stdout);
}

export async function sendMessage(input: {
  chatId?: string;
  to?: string;
  body: string;
}): Promise<ImsgMessage | null> {
  const args = ["send", "--text", input.body, "--json"];
  if (input.chatId) {
    args.push("--chat-id", input.chatId);
  } else if (input.to) {
    args.push("--to", input.to);
  } else {
    throw new Error("sendMessage requires chatId or to");
  }

  const { stdout } = await runImsg(args);
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  return JSON.parse(lines[lines.length - 1]!) as ImsgMessage;
}

export async function probeWatch(): Promise<boolean> {
  try {
    const child = spawn(imsgPath(), ["watch", "--help"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return await new Promise((resolve) => {
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  } catch {
    return false;
  }
}

export function watchMessages(
  onMessage: (message: ImsgMessage) => void,
  onError: (error: Error) => void,
): () => void {
  const child = spawn(imsgPath(), ["watch", "--json"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    try {
      onMessage(JSON.parse(trimmed) as ImsgMessage);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      process.stderr.write(`[imsg watch] ${text}\n`);
    }
  });

  child.on("error", onError);
  child.on("close", (code) => {
    if (code !== 0 && code !== null) {
      onError(new Error(`imsg watch exited with code ${code}`));
    }
  });

  return () => {
    rl.close();
    child.kill("SIGTERM");
  };
}
