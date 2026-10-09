import axiosRequest from "@/utils/request";
import type { ApiResponse } from "./auth";

export type PromoTileTheme = "light" | "dark";
export interface PromoTile {
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  image: string;
  theme: PromoTileTheme;
}
export interface HomePromise {
  title: string;
  description: string;
}
export interface StoreSettings {
  contact: { address: string; email: string; phone: string };
  socials: { facebook: string; instagram: string; twitter: string };
  promoTiles: PromoTile[];
  homePromises: HomePromise[];
  productPromises: string[];
}
export type Revisioned<T> = T & { revision: number };

export type PolicySlug = "dieu-khoan" | "doi-tra" | "ho-tro" | "bao-mat";
export interface PolicyPageSummary {
  slug: PolicySlug;
  title: string;
  isPublished: boolean;
  updatedAt: string | null;
}
export interface PolicyPage extends PolicyPageSummary {
  contentHtml: string;
  revision: number;
}
export interface PolicyPageInput {
  title: string;
  contentHtml: string;
  isPublished: boolean;
  revision: number;
}

const inlineErrors = { toastError: false };
const policyPath = (slug: PolicySlug) => `/policies/${encodeURIComponent(slug)}`;

export const getStoreSettingsAPI = (
  signal?: AbortSignal
): Promise<ApiResponse<Revisioned<StoreSettings>>> =>
  axiosRequest.get("/store-settings", { ...inlineErrors, signal });
export const saveStoreSettingsAPI = (
  input: Revisioned<StoreSettings>
): Promise<ApiResponse<Revisioned<StoreSettings>>> =>
  axiosRequest.put("/store-settings", input, inlineErrors);
export const listPoliciesAPI = (signal?: AbortSignal): Promise<ApiResponse<PolicyPageSummary[]>> =>
  axiosRequest.get("/policies", { ...inlineErrors, signal });
export const getPolicyAPI = (
  slug: PolicySlug,
  signal?: AbortSignal
): Promise<ApiResponse<PolicyPage>> =>
  axiosRequest.get(policyPath(slug), { ...inlineErrors, signal });
export const savePolicyAPI = (
  slug: PolicySlug,
  input: PolicyPageInput
): Promise<ApiResponse<PolicyPage>> => axiosRequest.put(policyPath(slug), input, inlineErrors);
