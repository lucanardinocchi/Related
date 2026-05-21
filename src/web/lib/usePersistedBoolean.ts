"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Persist a boolean in localStorage with a subscribe/getSnapshot pattern
 * so the initial client render matches storage (no expand→collapse flash)
 * and SSR always sees the `serverDefault`.
 */
export function usePersistedBoolean(
  key: string,
  serverDefault = false,
): [boolean, () => void] {
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

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return serverDefault;
    }
  }, [key, serverDefault]);

  const value = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => serverDefault,
  );

  const toggle = useCallback(() => {
    try {
      const next = !(window.localStorage.getItem(key) === "1");
      window.localStorage.setItem(key, next ? "1" : "0");
      window.dispatchEvent(new Event(key));
    } catch {
      // private mode — in-memory only via forced re-render won't work;
      // useSyncExternalStore won't update. Acceptable degradation.
    }
  }, [key]);

  return [value, toggle];
}
