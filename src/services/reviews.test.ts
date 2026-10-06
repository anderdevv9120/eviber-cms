import { describe, expect, it } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import axiosRequest from "@/utils/request";
import { response } from "@/test/attribute-fixtures";
import * as api from "./reviews";

describe("review transport", () => {
  it("uses admin review paths with inline errors", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    axiosRequest.defaults.adapter = async config => {
      calls.push(config);
      return response(config, {});
    };
    const signal = new AbortController().signal;
    await api.listReviewsAPI(
      { status: "pending", page: 2, pageSize: 20, rating: 5, search: "áo" },
      signal
    );
    await api.getReviewAPI("id/1", signal);
    await api.updateReviewStatusAPI("id/1", "approved");
    await api.saveReviewReplyAPI("id/1", "Cảm ơn");
    await api.deleteReviewReplyAPI("id/1");
    expect(calls.map(c => [c.method, c.url, c.params, c.toastError])).toEqual([
      [
        "get",
        "/reviews",
        { status: "pending", page: 2, pageSize: 20, rating: 5, search: "áo" },
        false
      ],
      ["get", "/reviews/id%2F1", undefined, false],
      ["patch", "/reviews/id%2F1/status", undefined, false],
      ["put", "/reviews/id%2F1/reply", undefined, false],
      ["delete", "/reviews/id%2F1/reply", undefined, false]
    ]);
    expect(JSON.parse(calls[2].data)).toEqual({ status: "approved" });
    expect(JSON.parse(calls[3].data)).toEqual({ content: "Cảm ơn" });
    expect(calls[0].signal).toBe(signal);
  });

  it("allows only the documented status moves", () => {
    expect(api.REVIEW_NEXT_STATUSES).toEqual({
      pending: ["approved", "rejected"],
      approved: ["rejected"],
      rejected: ["approved"]
    });
  });
});
