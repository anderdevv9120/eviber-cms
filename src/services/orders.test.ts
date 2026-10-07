import { describe, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import axiosRequest, { ApiError } from "@/utils/request";
import { order, orderList, response } from "@/test/order-fixtures";
import * as api from "./orders";

vi.mock("@/utils/notification", () => ({ errorNotification: vi.fn() }));
import { errorNotification } from "@/utils/notification";

describe("order transport through the shared Axios client", () => {
  it("keeps one envelope, combined filters, encoded IDs and read cancellation", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, config.url === "/orders" ? orderList() : order);
    };
    const signal = new AbortController().signal;
    const query = {
      page: 3,
      pageSize: 20,
      search: "An & Bình",
      status: "cancelled",
      paymentStatus: "paid",
      attention: "refund-needed"
    } as const;
    expect(await api.listOrdersAPI(query, signal)).toEqual({
      data: orderList(),
      message: "success"
    });
    expect(await api.getOrderAPI("id /?#", signal)).toEqual({ data: order, message: "success" });
    expect(calls.map(c => [c.method, c.url, c.params, c.signal, c.toastError])).toEqual([
      ["get", "/orders", query, signal, false],
      ["get", "/orders/id%20%2F%3F%23", undefined, signal, false]
    ]);
    expect(calls[0].headers.Authorization).toBe("Bearer test-admin");
  });

  it("sends exactly the reviewed revision and payment intent and returns detail", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, order);
    };
    expect(
      await api.transitionOrderAPI("id /?#", {
        status: "cancelled",
        expectedRevision: 4,
        note: "Lý do hủy"
      })
    ).toEqual({ data: order, message: "success" });
    expect(
      await api.updatePaymentAPI("id /?#", {
        paymentStatus: "failed",
        action: "correction",
        expectedRevision: 4,
        note: "Ghi nhầm",
        reference: "BANK-1"
      })
    ).toEqual({ data: order, message: "success" });
    expect(calls.map(c => [c.method, c.url, JSON.parse(c.data), c.toastError])).toEqual([
      [
        "patch",
        "/orders/id%20%2F%3F%23/status",
        { status: "cancelled", expectedRevision: 4, note: "Lý do hủy" },
        false
      ],
      [
        "patch",
        "/orders/id%20%2F%3F%23/payment-status",
        {
          paymentStatus: "failed",
          action: "correction",
          expectedRevision: 4,
          note: "Ghi nhầm",
          reference: "BANK-1"
        },
        false
      ]
    ]);
  });

  it.each(["fulfillment", "payment"])(
    "preserves 409 status/message without replaying %s",
    async kind => {
      const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
        Promise.reject(
          new AxiosError("conflict", "ERR_BAD_REQUEST", config, null, {
            config,
            data: { message: "Đơn hàng đã thay đổi", errors: { code: "order00001" } },
            status: 409,
            statusText: "Conflict",
            headers: {}
          })
        )
      );
      axiosRequest.defaults.adapter = adapter;
      const result =
        kind === "fulfillment"
          ? api.transitionOrderAPI("o", { status: "confirmed", expectedRevision: 0 })
          : api.updatePaymentAPI("o", {
              paymentStatus: "paid",
              action: "receipt",
              expectedRevision: 0
            });
      await expect(result).rejects.toEqual(new ApiError("Đơn hàng đã thay đổi", 409));
      expect(adapter).toHaveBeenCalledTimes(1);
      expect(errorNotification).not.toHaveBeenCalled();
    }
  );

  it.each([AxiosError.ECONNABORTED, AxiosError.ETIMEDOUT, AxiosError.ERR_NETWORK])(
    "keeps ambiguous %s outcomes statusless and never replays PATCH",
    async code => {
      const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
        Promise.reject(new AxiosError("timeout", code, config))
      );
      axiosRequest.defaults.adapter = adapter;
      await expect(
        api.updatePaymentAPI("o", { paymentStatus: "paid", action: "receipt", expectedRevision: 4 })
      ).rejects.toEqual(new ApiError("Không thể kết nối đến máy chủ, vui lòng thử lại"));
      expect(adapter).toHaveBeenCalledTimes(1);
      expect(errorNotification).not.toHaveBeenCalled();
    }
  );

  it("requires reviewed revisions and explicit payment actions in the CMS types", () => {
    // @ts-expect-error CMS fulfillment never uses the optional legacy backend revision.
    const noRevision: api.TransitionOrderInput = { status: "confirmed" };
    // @ts-expect-error CMS payment requires an explicit intent.
    const noAction: api.UpdatePaymentInput = { paymentStatus: "paid", expectedRevision: 0 };
    // @ts-expect-error Payment also requires a reviewed revision.
    const noPaymentRevision: api.UpdatePaymentInput = { paymentStatus: "paid", action: "receipt" };
    expect([noRevision, noAction, noPaymentRevision]).toHaveLength(3);
  });
});
