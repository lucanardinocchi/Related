const DEFAULT_MODEL = "bytedance/seedance-2.0";

export type ReplicateFailureCode = "insufficient_credits" | "generation_failed";

export class ReplicateValuesError extends Error {
  constructor(
    readonly code: ReplicateFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "ReplicateValuesError";
  }
}

export function buildSeedanceInput(prompt: string, duration = 8): Record<string, unknown> {
  return {
    prompt,
    aspect_ratio: "9:16",
    resolution: "720p",
    duration: Math.min(15, Math.max(5, duration)),
    generate_audio: false,
  };
}

export async function replicateCreatePrediction(
  token: string,
  model: string,
  input: Record<string, unknown>,
): Promise<{ id: string; status: string }> {
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  const body = await res.text();
  if (!res.ok) {
    if (res.status === 402) {
      throw new ReplicateValuesError(
        "insufficient_credits",
        "Insufficient Replicate credit. Add billing at replicate.com/account/billing.",
      );
    }
    throw new ReplicateValuesError(
      "generation_failed",
      `Replicate create failed (${res.status}): ${body}`,
    );
  }

  return JSON.parse(body);
}

export async function replicateGetPrediction(
  token: string,
  id: string,
): Promise<{
  id: string;
  status: string;
  output?: unknown;
  error?: string;
}> {
  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new ReplicateValuesError(
      "generation_failed",
      `Replicate poll failed (${res.status}): ${body}`,
    );
  }
  return JSON.parse(body);
}

export function extractVideoUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  throw new ReplicateValuesError("generation_failed", "Unexpected Replicate output");
}

export function replicateModel(): string {
  return Deno.env.get("REPLICATE_VIDEO_MODEL") ?? DEFAULT_MODEL;
}

export async function downloadVideoBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ReplicateValuesError(
      "generation_failed",
      `Video download failed (${res.status})`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}
