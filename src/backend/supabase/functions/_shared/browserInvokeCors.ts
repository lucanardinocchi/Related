// CORS for Edge Functions invoked from the browser via supabase.functions.invoke.
// The JS client sends authorization, apikey, x-client-info, and content-type.

export const BROWSER_INVOKE_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

/** Respond to a CORS preflight from supabase-js in the browser. */
export function browserInvokeOptionsResponse(): Response {
  return new Response(null, { status: 204, headers: BROWSER_INVOKE_CORS_HEADERS });
}

export function browserInvokeJsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BROWSER_INVOKE_CORS_HEADERS, "content-type": "application/json" },
  });
}
