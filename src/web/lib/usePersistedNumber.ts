"use client";

import { useCallback, useSyncExternalStore } from "react";

function readNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
    window.dispatchEvent(new Event(key));
  } catch {
    // private mode — ignore
  }
}

/**
 * Persist a number in localStorage with subscribe/getSnapshot for SSR-safe reads.
 */
export function usePersistedNumber(
  key: string,
  serverDefault = 0,
): [number, (value: number) => void] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(key, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(key, onStoreChange);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(
    () => readNumber(key, serverDefault),
    [key, serverDefault],
  );

  const value = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => serverDefault,
  );

  const setValue = useCallback(
    (next: number) => {
      writeNumber(key, next);
    },
    [key],
  );

  return [value, setValue];
}
