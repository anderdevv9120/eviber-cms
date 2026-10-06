import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export type ReviewStatus = "pending" | "approved" | "rejected";
export interface AdminReview {
  _id: string;
  displayName: string;
  email: string;
  reviewerType: "registered" | "guest";
  userId: string | null;
  rating: number;
  title?: string;
  content?: string;
  images: string[];
  status: ReviewStatus;
  adminReply: { content: string; repliedAt: string; repliedBy: string } | null;
  product: { _id: string; name: string | null; image: string | null } | null;
  variantId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  created_at: string;
  updated_at: string;
}
export interface ReviewListQuery {
  status: ReviewStatus;
  page: number;
  pageSize: number;
  rating?: number;
  search?: string;
}
export interface ReviewListResult {
  data: AdminReview[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}

/** Khớp backend: pending chưa ai xem; approved ↔ rejected là hiện/ẩn. */
export const REVIEW_NEXT_STATUSES: Record<ReviewStatus, ReviewStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["rejected"],
  rejected: ["approved"]
};

const inlineErrors = { toastError: false };
const reviewPath = (id: string) => `/reviews/${encodeURIComponent(id)}`;

export const listReviewsAPI = (
  { status, page, pageSize, rating, search }: ReviewListQuery,
  signal?: AbortSignal
): Promise<ApiResponse<ReviewListResult>> =>
  axiosRequest.get("/reviews", {
    ...inlineErrors,
    params: { status, page, pageSize, rating, search },
    signal
  });
export const getReviewAPI = (id: string, signal?: AbortSignal): Promise<ApiResponse<AdminReview>> =>
  axiosRequest.get(reviewPath(id), { ...inlineErrors, signal });
export const updateReviewStatusAPI = (
  id: string,
  status: ReviewStatus
): Promise<ApiResponse<AdminReview>> =>
  axiosRequest.patch(`${reviewPath(id)}/status`, { status }, inlineErrors);
export const saveReviewReplyAPI = (
  id: string,
  content: string
): Promise<ApiResponse<AdminReview>> =>
  axiosRequest.put(`${reviewPath(id)}/reply`, { content }, inlineErrors);
export const deleteReviewReplyAPI = (id: string): Promise<ApiResponse<AdminReview>> =>
  axiosRequest.delete(`${reviewPath(id)}/reply`, inlineErrors);
