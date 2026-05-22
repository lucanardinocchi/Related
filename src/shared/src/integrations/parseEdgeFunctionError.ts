/** Extract a user-facing message from a Supabase functions.invoke error. */
export async function parseEdgeFunctionError(
  error: unknown,
  fallback: string,
): Promise<string> {
  const base =
    error instanceof Error ? error.message : fallback;

  const context = (error as { context?: Response }).context;
  if (!(context instanceof Response)) {
    return base;
  }

  try {
    const body = (await context.clone().json()) as {
      error?: string;
      message?: string;
    };
    return body.error ?? body.message ?? base;
  } catch {
    return base;
  }
}
