// Shared Meta-style webhook signature verification.
//
// Meta (Facebook/Instagram/WhatsApp) signs webhook payloads with an HMAC-SHA256
// of the raw request body, keyed by the app secret, and delivers it as
// `X-Hub-Signature-256: sha256=<hex>`. Verification MUST use the raw bytes —
// re-serialising JSON will produce a different hash.
//
// Security model:
// - If the secret is set, the signature header is REQUIRED and must match.
//   Missing/invalid → reject (401).
// - If the secret is unset, we warn loudly and accept the request so local
//   development keeps working. Production deployments MUST set the secret.

export type SignatureCheck =
  | { ok: true }
  | { ok: false; status: number; reason: string };

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256Hex(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return new Uint8Array(sig);
}

/**
 * Verify a Meta-style `X-Hub-Signature-256` header against the raw request
 * body. Returns `{ ok: true }` when the request should be accepted.
 *
 * @param provider Used only for log messages (e.g. "instagram", "whatsapp").
 */
export async function verifyMetaSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string | undefined;
  provider: string;
}): Promise<SignatureCheck> {
  const { rawBody, signatureHeader, appSecret, provider } = opts;

  if (!appSecret) {
    console.warn(
      `[${provider}-webhook] APP_SECRET not set — accepting webhook without signature verification. ` +
        `This is INSECURE. Set the secret in production to require signed payloads.`,
    );
    return { ok: true };
  }

  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return {
      ok: false,
      status: 401,
      reason: "missing or malformed X-Hub-Signature-256",
    };
  }

  const expectedBytes = hexToBytes(signatureHeader.slice("sha256=".length));
  if (!expectedBytes) {
    return { ok: false, status: 401, reason: "invalid signature encoding" };
  }

  const actualBytes = await hmacSha256Hex(appSecret, rawBody);
  if (!constantTimeEqual(actualBytes, expectedBytes)) {
    return { ok: false, status: 401, reason: "signature mismatch" };
  }

  return { ok: true };
}
