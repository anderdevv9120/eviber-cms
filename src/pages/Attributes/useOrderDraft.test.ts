import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import useOrderDraft from "./useOrderDraft";

describe("order draft", () => {
  it("moves only adjacent values, retains the captured revision and discards locally", () => {
    const { result } = renderHook(() => useOrderDraft(["m", "s", "l", "xl"], 4));
    act(() => result.current.move("s", "up"));
    expect(result.current.valueIds).toEqual(["s", "m", "l", "xl"]);
    expect(result.current.expectedRevision).toBe(4);
    expect(result.current.dirty).toBe(true);
    act(() => result.current.move("s", "up"));
    act(() => result.current.move("xl", "down"));
    act(() => result.current.move("unknown", "down"));
    expect(result.current.valueIds).toEqual(["s", "m", "l", "xl"]);
    act(() => result.current.discard());
    expect(result.current.valueIds).toEqual(["m", "s", "l", "xl"]);
    expect(result.current.dirty).toBe(false);
  });
  it("resets only when authoritative ids or revision change, not on equivalent renders", () => {
    const { result, rerender } = renderHook(({ ids, revision }) => useOrderDraft(ids, revision), {
      initialProps: { ids: ["a", "b"], revision: 4 }
    });
    act(() => result.current.move("b", "up"));
    rerender({ ids: ["a", "b"], revision: 4 });
    expect(result.current.valueIds).toEqual(["b", "a"]);
    rerender({ ids: ["b", "a", "c"], revision: 5 });
    expect(result.current.valueIds).toEqual(["b", "a", "c"]);
    expect(result.current.expectedRevision).toBe(5);
    expect(result.current.dirty).toBe(false);
  });
  it("handles empty order and returning to the saved sequence", () => {
    const { result, rerender } = renderHook(({ ids }) => useOrderDraft(ids, 0), {
      initialProps: { ids: [] as string[] }
    });
    act(() => result.current.move("missing", "up"));
    expect(result.current.valueIds).toEqual([]);
    expect(result.current.dirty).toBe(false);
    rerender({ ids: ["a", "b"] });
    act(() => result.current.move("b", "up"));
    act(() => result.current.move("b", "down"));
    expect(result.current.dirty).toBe(false);
  });
});
