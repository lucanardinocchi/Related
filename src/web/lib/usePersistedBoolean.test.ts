import { act, renderHook } from "@testing-library/react";
import { usePersistedBoolean } from "./usePersistedBoolean";

describe("usePersistedBoolean", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reads the initial value from localStorage on first render", () => {
    window.localStorage.setItem("test.key", "1");
    const { result } = renderHook(() => usePersistedBoolean("test.key"));
    expect(result.current[0]).toBe(true);
  });

  it("toggle flips the value and persists it", () => {
    const { result } = renderHook(() => usePersistedBoolean("test.key"));
    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem("test.key")).toBe("1");

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem("test.key")).toBe("0");
  });
});
