/**
 * Encodes a single SSE event into the wire format the
 * `parseSseStream` parser in ChatsClient expects:
 *
 *   event: <name>\ndata: <json>\n\n
 */
export function encodeSseEvent(event: string, data: unknown): Uint8Array {
  const payload = JSON.stringify(data ?? {});
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
}
