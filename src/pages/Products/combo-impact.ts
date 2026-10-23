import type { GridRow, SavedVariant } from "./variant-grid";

export function impactOf(saved: SavedVariant[], rows: GridRow[]) {
  const byId = new Map(saved.map(variant => [variant._id, variant]));
  let priceChanged = false;
  let deactivated = false;
  for (const row of rows) {
    const baseline = row.saved && byId.get(row.saved._id);
    if (!baseline) continue;
    if (row.price !== baseline.price) priceChanged = true;
    if (baseline.status === "ACTIVE" && row.status === "INACTIVE") deactivated = true;
  }
  return { priceChanged, deactivated };
}
