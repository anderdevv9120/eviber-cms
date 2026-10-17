import type { AdjustStockRequest } from "@/services/inventory";

export type AdjustMode = "in" | "out" | "count";

// Backend adjust rules: delta -100000..100000, note optional, trimmed max 500.
export const MAX_DELTA = 100000;
export const MAX_NOTE = 500;

/** Signed change for the mode, or null while the amount is not a usable integer. */
function deltaOf(mode: AdjustMode, amount: number | null, current: number): number | null {
  if (amount === null || !Number.isInteger(amount)) return null;
  if (mode === "count") return amount >= 0 ? amount - current : null;
  if (amount <= 0) return null;
  return mode === "in" ? amount : -amount;
}

/** Stock after the adjustment; negative when out exceeds stock, null without a usable amount. */
export function previewAfter(mode: AdjustMode, amount: number | null, current: number) {
  const delta = deltaOf(mode, amount, current);
  return delta === null ? null : current + delta;
}

/** The request to send, or null when the form must not be submitted. */
export function toAdjustRequest(
  mode: AdjustMode,
  amount: number | null,
  current: number,
  note: string
): AdjustStockRequest | null {
  const delta = deltaOf(mode, amount, current);
  const trimmed = note.trim();
  if (delta === null || delta === 0 || Math.abs(delta) > MAX_DELTA) return null;
  if (current + delta < 0 || trimmed.length > MAX_NOTE) return null;
  return {
    delta,
    ...(trimmed && { note: trimmed }),
    ...(mode === "count" && { expectedCurrent: current })
  };
}
