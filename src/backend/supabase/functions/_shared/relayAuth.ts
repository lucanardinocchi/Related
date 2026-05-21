// Shared helpers for Mac Messages relay edge functions — device auth,
// secret hashing, CORS, and admin Supabase client.
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

export const RELAY_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, content-type, x-relay-device-id, x-relay-device-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...RELAY_CORS_HEADERS, "content-type": "application/json" },
  });
}

export function createAdminClient(): any {
  return createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export async function hashDeviceSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RelayDeviceAuth {
  deviceId: string;
  ownerId: string;
}

export async function verifyRelayDevice(
  req: Request,
  adminClient: any,
): Promise<RelayDeviceAuth | Response> {
  const deviceId = req.headers.get("X-Relay-Device-Id");
  const deviceSecret = req.headers.get("X-Relay-Device-Secret");

  if (!deviceId || !deviceSecret) {
    return jsonResponse(401, { error: "missing relay device credentials" });
  }

  const { data: device, error } = await adminClient
    .from("relay_devices")
    .select("id, owner_id, device_secret_hash")
    .eq("id", deviceId)
    .maybeSingle();

  if (error) {
    return jsonResponse(500, { error: error.message });
  }
  if (!device) {
    return jsonResponse(401, { error: "invalid device credentials" });
  }

  const hash = await hashDeviceSecret(deviceSecret);
  if (hash !== device.device_secret_hash) {
    return jsonResponse(401, { error: "invalid device credentials" });
  }

  return { deviceId: device.id, ownerId: device.owner_id };
}

/** Strip non-digits so phone handles and contact.phone can be compared. */
export function normalizePhoneDigits(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}
