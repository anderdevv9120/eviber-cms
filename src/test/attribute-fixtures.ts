import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { clearSession } from "@/utils/session";
import { setCookies } from "@/utils/cookies";
import { ACCESS_TOKEN_KEY } from "@/constants";

export const attribute = {
  _id: "size-id",
  code: "size",
  name: "Kích thước",
  revision: 4,
  valueCount: 4,
  productUsageCount: 0,
  variantUsageCount: 0,
  created_at: "2026-10-03T00:00:00.000Z",
  updated_at: "2026-10-03T00:00:00.000Z"
};
export const value = {
  _id: "s-id",
  attributeId: attribute._id,
  value: "S",
  meta: null,
  sortOrder: 0,
  productUsageCount: 0,
  variantUsageCount: 0,
  created_at: attribute.created_at,
  updated_at: attribute.updated_at
};
export const list = (data = [attribute], page = 1, total = data.length, pageSize = 10) => ({
  data,
  page,
  pageSize,
  total,
  totalPage: Math.max(1, Math.ceil(total / pageSize))
});
export const response = (config: InternalAxiosRequestConfig, data: unknown): AxiosResponse => ({
  config,
  data: { data, message: "success" },
  status: 200,
  statusText: "OK",
  headers: {}
});
export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

// Ant Design uses responsive media queries even in a jsdom component test.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
  const getStyle = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation(element => getStyle(element));
  setCookies(ACCESS_TOKEN_KEY, "test-admin");
});
const originalAdapter = axiosRequest.defaults.adapter;
afterEach(() => {
  cleanup();
  clearSession();
  axiosRequest.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
