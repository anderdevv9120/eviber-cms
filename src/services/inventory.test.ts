import { describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/order-fixtures";
import * as api from "./inventory";

const row: api.InventoryRow = {
  variantId: "v1",
  productId: "p1",
  productName: "Áo thun",
  productStatus: "PUBLISH",
  sku: "SKU-1",
  attributeLabels: ["Đỏ", "M"],
  image: null,
  variantStatus: "ACTIVE",
  inventoryCount: 3
};
const movement: api.InventoryMovement = {
  id: "m1",
  createdAt: "2026-10-14T03:00:00.000Z",
  reason: "manual_adjust",
  delta: 2,
  stockAfter: 5,
  note: "Nhập thêm",
  actor: null,
  order: null
};
const list: api.InventoryList = {
  data: [row],
  total: 1,
  page: 1,
  pageSize: 10,
  totalPage: 1,
  metadata: { lowStockThreshold: 5, stock: "all" }
};
const path = (config: InternalAxiosRequestConfig) =>
  axiosRequest.getUri(config).slice(axiosRequest.defaults.baseURL!.length);

describe("inventory transport through the shared Axios client", () => {
  it("reads the list, movements and posts an adjustment with inline errors", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      if (config.method === "post") return response(config, { row, movement });
      return response(
        config,
        config.url === "/inventory" ? list : { data: [movement], variant: row }
      );
    };
    const signal = new AbortController().signal;
    const query: api.InventoryQuery = {
      search: "áo",
      productId: "p1",
      variantId: "000000000000000000000012",
      productStatus: "DRAFT",
      variantStatus: "INACTIVE",
      stock: "low",
      lowStockThreshold: 7,
      page: 2,
      pageSize: 20
    };
    expect(await api.getInventoryAPI(query, signal)).toEqual({ data: list, message: "success" });
    await api.getInventoryMovementsAPI("v 1", { page: 2, pageSize: 10 }, signal);
    expect(await api.adjustStockAPI("v1", { delta: -2, note: "Hỏng", expectedCurrent: 3 })).toEqual(
      {
        data: { row, movement },
        message: "success"
      }
    );
    expect(calls.map(c => [c.method, path(c), c.signal, c.toastError])).toEqual([
      [
        "get",
        "/inventory?search=%C3%A1o&productId=p1&variantId=000000000000000000000012&productStatus=DRAFT&variantStatus=INACTIVE&stock=low&lowStockThreshold=7&page=2&pageSize=20",
        signal,
        false
      ],
      ["get", "/inventory/v%201/movements?page=2&pageSize=10", signal, false],
      ["post", "/inventory/v1/adjustments", undefined, false]
    ]);
    expect(JSON.parse(calls[2].data)).toEqual({ delta: -2, note: "Hỏng", expectedCurrent: 3 });
  });
});
