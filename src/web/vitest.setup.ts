import "@testing-library/jest-dom/vitest";

// jsdom's localStorage is incomplete in some Vitest versions — provide a
// minimal in-memory store so persistence hooks and Sidebar tests work.
const store = new Map<string, string>();

const localStorageMock: Storage = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  setItem(key: string, value: string) {
    store.set(key, value);
  },
  removeItem(key: string) {
    store.delete(key);
  },
  key(index: number) {
    return [...store.keys()][index] ?? null;
  },
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});
