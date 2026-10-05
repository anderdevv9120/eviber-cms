import type {
  OrderStatus,
  PaymentStatus,
  PaymentAction,
  PaymentMethod,
  OrderActorType
} from "@/services/orders";

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: "Chờ xử lý",
  confirmed: "Đã xác nhận",
  shipped: "Đang giao hàng",
  delivered: "Đã giao hàng",
  cancelled: "Đã hủy",
  returned: "Đã trả hàng"
};
export const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
  failed: "Thanh toán thất bại"
};
export const paymentActionLabels: Record<PaymentAction, string> = {
  receipt: "Ghi nhận thanh toán",
  refund: "Ghi nhận hoàn tiền",
  correction: "Điều chỉnh trạng thái thanh toán"
};
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "Tiền mặt",
  CARD: "Thẻ",
  BANK_TRANSFER: "Chuyển khoản ngân hàng",
  E_WALLET: "Ví điện tử"
};
export const orderActorLabels: Record<OrderActorType, string> = {
  customer: "Khách hàng",
  admin: "Quản trị viên",
  system: "Hệ thống",
  webhook: "Webhook"
};
export const missingOrderData = "Chưa có dữ liệu";
export const legacyPaymentActionLabel = "Thay đổi cũ (chưa phân loại)";
export const displayOrderText = (value?: string | null): string =>
  value?.trim() || missingOrderData;
export const formatOrderAmount = (amount?: number, currency?: string): string => {
  if (
    amount === undefined ||
    !Number.isFinite(amount) ||
    !currency ||
    !/^[A-Za-z]{3}$/.test(currency)
  )
    return missingOrderData;
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(amount);
};
export const formatOrderDate = (value?: string): string => {
  if (!value) return missingOrderData;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? missingOrderData : date.toLocaleString("vi-VN");
};
export const orderActionLabels: Record<OrderStatus, string> = {
  pending: "Đặt lại chờ xử lý",
  confirmed: "Xác nhận đơn hàng",
  shipped: "Giao cho vận chuyển",
  delivered: "Xác nhận đã giao",
  cancelled: "Hủy đơn hàng",
  returned: "Xác nhận trả hàng"
};
