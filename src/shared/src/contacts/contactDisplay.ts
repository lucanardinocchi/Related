/** Split a display name into first token and last-name initial (if any). */
export function parsePersonName(name: string): {
  first: string;
  lastInitial: string | null;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "?", lastInitial: null };
  const first = parts[0]!;
  const lastInitial =
    parts.length > 1
      ? (parts[parts.length - 1]![0]?.toUpperCase() ?? null)
      : null;
  return { first, lastInitial };
}

/** First names that appear on more than one contact in the directory. */
export function firstNamesWithDuplicates(names: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const name of names) {
    const first = parsePersonName(name).first.toLowerCase();
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [first, count] of counts) {
    if (count > 1) dupes.add(first);
  }
  return dupes;
}

/**
 * Short label for a contact: first name only, or "First L" when the first
 * name is shared by multiple contacts in the directory.
 */
export function contactDisplayLabel(
  name: string,
  ambiguousFirstNames: Set<string>,
): string {
  const { first, lastInitial } = parsePersonName(name);
  const needsDisambiguation = ambiguousFirstNames.has(first.toLowerCase());
  if (needsDisambiguation && lastInitial) return `${first} ${lastInitial}`;
  return first;
}

export function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Pocket import labels may be `Sam (Sam Chen)` or plain `Sam Chen`. */
export function resolveContactNameFromPocketLabel(label: string): string {
  const trimmed = label.trim();
  const match = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) return match[2]!.trim();
  return trimmed;
}

export function parsePocketAttributedLine(
  line: string,
): { label: string; text: string } | null {
  const match = line.match(/^\[([^\]]+)\]:\s?(.*)$/);
  if (!match) return null;
  return { label: match[1]!, text: match[2]! };
}

export type PocketAssistantSegment =
  | { kind: "attributed"; contactName: string; text: string }
  | { kind: "plain"; text: string };

/**
 * Split stored Pocket assistant message content into speaker-attributed
 * segments (from speaker-resolution import) or plain text lines.
 */
export function segmentPocketAssistantContent(
  content: string,
): PocketAssistantSegment[] {
  const lines = content.split("\n");
  const segments: PocketAssistantSegment[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parsePocketAttributedLine(line);
    if (!parsed) {
      segments.push({ kind: "plain", text: line });
      continue;
    }
    const contactName = resolveContactNameFromPocketLabel(parsed.label);
    const last = segments[segments.length - 1];
    if (
      last?.kind === "attributed" &&
      last.contactName === contactName
    ) {
      last.text += `\n${parsed.text}`;
    } else {
      segments.push({
        kind: "attributed",
        contactName,
        text: parsed.text,
      });
    }
  }

  return segments;
}
