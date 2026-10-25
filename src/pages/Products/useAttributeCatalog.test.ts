import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { deferred } from "@/test/attribute-fixtures";
import { listAttributeOptionsAPI, type AttributeOption } from "@/services/attributes";
import { useAttributeCatalog } from "./useAttributeCatalog";

vi.mock("@/services/attributes", () => ({ listAttributeOptionsAPI: vi.fn() }));
const color: AttributeOption = {
  _id: "color",
  code: "color",
  name: "Màu",
  values: [{ _id: "red", value: "Đỏ" }]
};
const size: AttributeOption = { _id: "size", code: "size", name: "Cỡ", values: [] };
const ok = (data: AttributeOption[]) => ({ data, message: "success" });

beforeEach(() =>
  vi
    .mocked(listAttributeOptionsAPI)
    .mockReset()
    .mockResolvedValue(ok([color, size]))
);

it("reuses loaded options and still loads saved attributes outside the default page", async () => {
  const { result, rerender } = renderHook(({ ids }) => useAttributeCatalog(ids, true), {
    initialProps: { ids: ["color"] }
  });
  await waitFor(() => expect(result.current.attributes).toEqual([color, size]));
  rerender({ ids: ["color", "size"] });
  expect(listAttributeOptionsAPI).toHaveBeenCalledTimes(1);
  const pinned: AttributeOption = {
    _id: "pinned",
    code: "pinned",
    name: "Ngoài trang",
    values: []
  };
  vi.mocked(listAttributeOptionsAPI).mockResolvedValueOnce(ok([color, size, pinned]));
  rerender({ ids: ["color", "pinned"] });
  await waitFor(() => expect(result.current.attributes).toEqual([color, size, pinned]));
  expect(vi.mocked(listAttributeOptionsAPI).mock.lastCall?.[0]).toEqual(["color", "pinned"]);
});

it("hides options on revocation and ignores pending results until a fresh authorized load", async () => {
  const { result, rerender } = renderHook(({ enabled, ids }) => useAttributeCatalog(ids, enabled), {
    initialProps: { enabled: true, ids: ["color"] }
  });
  await waitFor(() => expect(result.current.attributes).toEqual([color, size]));
  const pending = deferred<Awaited<ReturnType<typeof listAttributeOptionsAPI>>>();
  vi.mocked(listAttributeOptionsAPI).mockReturnValueOnce(pending.promise);
  rerender({ enabled: true, ids: ["pinned"] });
  rerender({ enabled: false, ids: ["pinned"] });
  expect(result.current.attributes).toEqual([]);
  expect(result.current.values).toEqual({});
  await act(async () => pending.resolve(ok([color])));
  expect(result.current.attributes).toEqual([]);
  vi.mocked(listAttributeOptionsAPI).mockResolvedValueOnce(ok([size]));
  rerender({ enabled: true, ids: ["size"] });
  await waitFor(() => expect(result.current.attributes).toEqual([size]));
  expect(listAttributeOptionsAPI).toHaveBeenCalledTimes(3);
});
