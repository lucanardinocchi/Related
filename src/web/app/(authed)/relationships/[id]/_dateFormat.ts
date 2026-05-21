export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** Time only for messages within the last 24 hours; date otherwise. */
export function fmtCommsSentAt(iso: string, now: Date = new Date()): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;

  if (now.getTime() - parsed.getTime() < TWENTY_FOUR_HOURS_MS) {
    return fmtTime(iso);
  }

  return fmtDate(iso);
}

export function toLocalDtInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalDtInput(local: string): string {
  return new Date(local).toISOString();
}
