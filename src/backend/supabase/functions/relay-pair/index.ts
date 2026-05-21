// relay-pair Edge Function — generate pairing codes (JWT) and exchange
// them for device credentials (no JWT).
//
// Deploy:
//   supabase functions deploy relay-pair
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import {
  createAdminClient,
  hashDeviceSecret,
  jsonResponse,
  RELAY_CORS_HEADERS,
} from "../_shared/relayAuth.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_TTL_MS = 10 * 60 * 1000;

interface CreateCodeRequest {
  action: "create_code";
}

interface ExchangeRequest {
  action: "exchange";
  code: string;
  deviceName: string;
  deviceSecret: string;
}

type PairRequest = CreateCodeRequest | ExchangeRequest;

function generatePairingCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

async function createPairingCode(ownerId: string, adminClient: any): Promise<string> {
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePairingCode();
    const { error } = await adminClient.from("relay_pairing_codes").insert({
      owner_id: ownerId,
      code,
      expires_at: expiresAt,
    });

    if (!error) return code;
    if (error.code !== "23505") {
      throw new Error(error.message);
    }
  }

  throw new Error("failed to generate unique pairing code");
}

async function exchangePairingCode(
  adminClient: any,
  input: ExchangeRequest,
): Promise<{ deviceId: string; ownerId: string }> {
  const code = input.code.trim().toUpperCase();
  if (!code || !input.deviceName?.trim() || !input.deviceSecret) {
    throw new Error("missing code, deviceName, or deviceSecret");
  }

  const { data: pairingRow, error: fetchError } = await adminClient
    .from("relay_pairing_codes")
    .select("id, owner_id, expires_at, consumed_at")
    .eq("code", code)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }
  if (!pairingRow) {
    throw new Error("invalid pairing code");
  }
  if (pairingRow.consumed_at) {
    throw new Error("pairing code already used");
  }
  if (new Date(pairingRow.expires_at).getTime() <= Date.now()) {
    throw new Error("pairing code expired");
  }

  const secretHash = await hashDeviceSecret(input.deviceSecret);

  const { data: device, error: deviceError } = await adminClient
    .from("relay_devices")
    .insert({
      owner_id: pairingRow.owner_id,
      name: input.deviceName.trim(),
      device_secret_hash: secretHash,
      last_seen_at: new Date().toISOString(),
    })
    .select("id, owner_id")
    .single();

  if (deviceError) {
    throw new Error(deviceError.message);
  }

  const { error: consumeError } = await adminClient
    .from("relay_pairing_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", pairingRow.id)
    .is("consumed_at", null);

  if (consumeError) {
    throw new Error(consumeError.message);
  }

  return { deviceId: device.id, ownerId: device.owner_id };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: RELAY_CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  let body: PairRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid JSON body" });
  }

  if (body.action !== "create_code" && body.action !== "exchange") {
    return jsonResponse(400, { error: "missing or invalid action" });
  }

  const adminClient = createAdminClient();

  if (body.action === "exchange") {
    try {
      const result = await exchangePairingCode(adminClient, body);
      return jsonResponse(200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("invalid") ||
        message.includes("expired") ||
        message.includes("already used") ||
        message.includes("missing")
      ) {
        return jsonResponse(400, { error: message });
      }
      return jsonResponse(500, { error: message });
    }
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing Authorization header" });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  const userRes = await userClient.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    return jsonResponse(401, { error: "auth failed" });
  }

  try {
    const code = await createPairingCode(userRes.data.user.id, adminClient);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    return jsonResponse(200, { code, expiresAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(500, { error: message });
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
