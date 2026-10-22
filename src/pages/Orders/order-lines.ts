import type { OrderCombo, OrderProduct } from "@/services/orders";

export interface OrderLineRow {
  key: string | number;
  productId?: string;
  variantId?: string;
  name?: string;
  image?: string;
  sku?: string;
  attributes?: OrderProduct["attributeValuesAtOrder"];
  quantity: number;
  originalUnitPrice?: number;
  unitPrice: number | null;
  lineTotal: number;
  children?: OrderLineRow[];
}

export function groupOrderLines(
  productInfo: OrderProduct[],
  combos: OrderCombo[] = []
): OrderLineRow[] {
  const snapshots = new Map(combos.map(combo => [combo.comboGroupId, combo]));
  const groups = new Map<string, OrderLineRow>();
  const rows: OrderLineRow[] = [];

  productInfo.forEach((line, key) => {
    const row: OrderLineRow = {
      key,
      productId: line.productId,
      variantId: line.variantId,
      name: line.productNameAtOrder,
      image: line.variantImageAtOrder,
      sku: line.variantSkuAtOrder,
      attributes: line.attributeValuesAtOrder,
      quantity: line.quantity,
      originalUnitPrice: line.originalPriceAtOrder,
      unitPrice: line.priceAtOrder,
      lineTotal: line.priceAtOrder * line.quantity
    };
    const combo = line.comboGroupId ? snapshots.get(line.comboGroupId) : undefined;
    if (!combo) {
      rows.push(row);
      return;
    }

    let group = groups.get(combo.comboGroupId);
    if (!group) {
      group = {
        key: combo.comboGroupId,
        name: combo.nameAtOrder,
        image: combo.imageAtOrder,
        quantity: combo.quantity,
        unitPrice: null,
        lineTotal: combo.totalAtOrder,
        children: []
      };
      groups.set(combo.comboGroupId, group);
      rows.push(group);
    }

    const piece = group.children!.find(piece => piece.variantId === line.variantId);
    if (piece) {
      piece.quantity += line.quantity;
      piece.lineTotal += row.lineTotal;
      if (piece.unitPrice !== line.priceAtOrder) piece.unitPrice = null;
    } else {
      group.children!.push(row);
    }
  });

  return rows;
}
