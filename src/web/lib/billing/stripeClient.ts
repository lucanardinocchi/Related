async function postBilling<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(payload.error ?? `Billing request failed (${res.status})`);
  }
  return payload as T;
}

export async function createCheckoutSession(input: {
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const result = await postBilling<{ url: string }>(
    "/api/billing/checkout",
    input,
  );
  if (!result.url) {
    throw new Error("Checkout session missing url");
  }
  return result;
}

export async function createPortalSession(input: {
  returnUrl: string;
}): Promise<{ url: string }> {
  const result = await postBilling<{ url: string }>(
    "/api/billing/portal",
    input,
  );
  if (!result.url) {
    throw new Error("Portal session missing url");
  }
  return result;
}
