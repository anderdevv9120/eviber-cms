import type { WritablePaymentStatus } from "@/services/orders";

export const NOTE_MAX = 500;
export const REFERENCE_MAX = 100;

export interface ActionDraft {
  target?: WritablePaymentStatus;
  note: string;
  reference: string;
}

export const validateNote = (raw: string, required: boolean): string | undefined => {
  const note = raw.trim();
  if (required && !note) return "Vui lòng nhập lý do";
  if (note.length > NOTE_MAX) return `Ghi chú tối đa ${NOTE_MAX} ký tự`;
};
export const validateReference = (raw: string): string | undefined =>
  raw.trim().length > REFERENCE_MAX ? `Mã tham chiếu tối đa ${REFERENCE_MAX} ký tự` : undefined;
