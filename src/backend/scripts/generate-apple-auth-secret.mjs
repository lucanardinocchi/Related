#!/usr/bin/env node
/**
 * Generate the Apple OAuth client secret (JWT) for Supabase Auth.
 *
 * Usage:
 *   node src/backend/scripts/generate-apple-auth-secret.mjs \
 *     --team-id YOUR_TEAM_ID \
 *     --client-id com.example.services \
 *     --key-id YOUR_KEY_ID \
 *     --p8 ./AuthKey_XXXXXXXXXX.p8
 *
 * Paste the output into Supabase Dashboard → Auth → Apple → Secret,
 * or SUPABASE_AUTH_EXTERNAL_APPLE_SECRET in src/backend/.env for local dev.
 *
 * Apple requires rotating this secret at least every 6 months.
 */

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "team-id": { type: "string" },
    "client-id": { type: "string" },
    "key-id": { type: "string" },
    p8: { type: "string" },
  },
});

const teamId = values["team-id"];
const clientId = values["client-id"];
const keyId = values["key-id"];
const p8Path = values.p8;

if (!teamId || !clientId || !keyId || !p8Path) {
  console.error(
    "Usage: node generate-apple-auth-secret.mjs --team-id … --client-id … --key-id … --p8 ./AuthKey.p8",
  );
  process.exit(1);
}

const privateKey = readFileSync(p8Path, "utf8");
const now = Math.floor(Date.now() / 1000);
// Apple allows up to 6 months; use ~179 days to stay under the limit.
const exp = now + 179 * 24 * 60 * 60;

const header = Buffer.from(
  JSON.stringify({ alg: "ES256", kid: keyId }),
).toString("base64url");
const payload = Buffer.from(
  JSON.stringify({
    iss: teamId,
    iat: now,
    exp,
    aud: "https://appleid.apple.com",
    sub: clientId,
  }),
).toString("base64url");

const signingInput = `${header}.${payload}`;
const sign = createSign("SHA256");
sign.update(signingInput);
sign.end();
const signature = sign.sign(privateKey).toString("base64url");

console.log(`${signingInput}.${signature}`);
