export function mergePayload<T extends object>(
  actionPayload: unknown,
  userEditsPayload: unknown,
): T {
  return {
    ...(actionPayload as T),
    ...((userEditsPayload as Partial<T>) ?? {}),
  } as T;
}
