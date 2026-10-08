import { describe, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import axiosRequest, { ApiError } from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import { errorNotification } from "@/utils/notification";
import * as api from "./vouchers";
vi.mock("@/utils/notification", () => ({ errorNotification: vi.fn() }));

describe("voucher backend transport", () => {
  it("uses admin paths, one envelope, whitelisted filters, revision, and abort signals", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    const payload = { data: [], page: 2, pageSize: 20, total: 0, totalPage: 0 };
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, payload);
    };
    const signal = new AbortController().signal;
    const query = {
      page: 2,
      pageSize: 20,
      search: "SAVE",
      availability: "active" as const,
      state: "released" as const,
      unknown: "secret"
    };
    expect(await api.listVouchersAPI(query, signal)).toEqual({ data: payload, message: "success" });
    await api.getVoucherAPI("id/1", signal);
    await api.listVoucherRedemptionsAPI("id/1", query, signal);
    await api.listVoucherProductTargetsAPI(query, signal);
    await api.listVoucherCategoryTargetsAPI(query, signal);
    expect(calls.map(c => [c.url, c.params, c.signal, c.toastError])).toEqual([
      [
        "/coupons",
        { page: 2, pageSize: 20, search: "SAVE", availability: "active" },
        signal,
        false
      ],
      ["/coupons/id%2F1", undefined, signal, false],
      ["/coupons/id%2F1/redemptions", { page: 2, pageSize: 20, state: "released" }, signal, false],
      ["/coupons/targets/products", { page: 2, pageSize: 20, search: "SAVE" }, signal, false],
      ["/coupons/targets/categories", { page: 2, pageSize: 20, search: "SAVE" }, signal, false]
    ]);
    const input = {
      code: "SAVE_20",
      name: "Sale",
      discountType: "percentage" as const,
      discountValue: 20,
      maxDiscountAmount: 50000,
      minOrderAmount: 300000,
      scopeType: "all" as const,
      scopeProductIds: [],
      scopeCategoryIds: [],
      usageLimit: null,
      perUserLimit: 1,
      startDate: "2026-10-08T17:00:00.000Z",
      endDate: "2026-10-09T17:00:00.000Z",
      isActive: true
    };
    await api.createVoucherAPI({ ...input, usedCount: 999 } as api.CouponInput);
    await api.updateVoucherAPI("id/1", {
      expectedRevision: 0,
      name: "Draft",
      code: "CHANGE",
      usedCount: 999
    } as api.CouponPatchInput);
    await api.updateVoucherAPI("id/1", { expectedRevision: 0, isActive: false });
    expect(calls.slice(5).map(c => [c.method, c.url, JSON.parse(c.data), c.toastError])).toEqual([
      ["post", "/coupons", input, false],
      ["patch", "/coupons/id%2F1", { expectedRevision: 0, name: "Draft" }, false],
      ["patch", "/coupons/id%2F1", { expectedRevision: 0, isActive: false }, false]
    ]);
  });
  it("preserves inline conflict errors without global notifications", async () => {
    axiosRequest.defaults.adapter = async config => {
      throw new AxiosError("conflict", "409", config, null, {
        config,
        status: 409,
        statusText: "Conflict",
        headers: {},
        data: { message: "Stale revision" }
      });
    };
    await expect(
      api.updateVoucherAPI("id", { expectedRevision: 0, isActive: false })
    ).rejects.toMatchObject({ status: 409, message: "Stale revision" });
    await expect(api.getVoucherAPI("id")).rejects.toBeInstanceOf(ApiError);
    expect(errorNotification).not.toHaveBeenCalled();
  });
});
