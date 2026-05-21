import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose Tailwind class strings with clsx (conditional class composition)
 * and twMerge (conflict resolution — later utilities win over earlier ones
 * on the same property). Used by every primitive in src/web/components/ui/.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
