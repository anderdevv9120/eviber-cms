import { useAppStore } from "@/store/useAppStore";
import { canAccess } from "@/utils/access";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Flex,
  Image,
  Input,
  Rate,
  Spin,
  Tag,
  Typography
} from "antd";
import { generatePath, Link } from "react-router";
import { PATH } from "@/constants/paths";
import {
  deleteReviewReplyAPI,
  getReviewAPI,
  REVIEW_NEXT_STATUSES,
  saveReviewReplyAPI,
  updateReviewStatusAPI,
  type AdminReview
} from "@/services/reviews";
import type { ApiResponse } from "@/services/auth";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { successNotification } from "@/utils/notification";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import { STATUS_COLOR, STATUS_LABEL } from "./review-list-query";

interface Props {
  reviewId: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function ReviewDrawer({ reviewId, onClose, onChanged }: Props) {
  const profile = useAppStore(state => state.profile);
  const canUpdate = !!profile && canAccess(profile, { anyOf: ["REVIEW_UPDATE"] });
  const canReadCustomer = !!profile && canAccess(profile, { anyOf: ["CUSTOMER_READ"] });
  const canReadProduct = !!profile && canAccess(profile, { anyOf: ["PRODUCT_READ"] });
  const canReadOrder = !!profile && canAccess(profile, { anyOf: ["ORDER_READ"] });
  const [review, setReview] = useState<AdminReview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");

  useEffect(() => {
    // Đổi review → cha remount qua key, state khởi tạo lại sẵn
    const controller = new AbortController();
    getReviewAPI(reviewId, controller.signal)
      .then(res => {
        setReview(res.data);
        setReply(res.data.adminReply?.content ?? "");
      })
      .catch(cause => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [reviewId]);

  // Lỗi giữ nguyên chữ admin đang gõ; 409 = người khác vừa đổi → tải lại review, không đụng ô phản hồi
  const act = async (
    action: () => Promise<ApiResponse<AdminReview>>,
    success: string,
    syncReply: boolean
  ) => {
    const latest = useAppStore.getState().profile;
    if (busy || !latest || !canAccess(latest, { anyOf: ["REVIEW_UPDATE"] })) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await action();
      setReview(res.data);
      if (syncReply) setReply(res.data.adminReply?.content ?? "");
      successNotification(success);
      onChanged();
    } catch (cause) {
      setActionError(getErrorMessage(cause));
      if (cause instanceof ApiError && cause.status === 409) {
        const fresh = await getReviewAPI(reviewId).catch(() => null);
        if (fresh) setReview(fresh.data);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const reviewer = (r: AdminReview) =>
    !canReadCustomer ? (
      r.displayName
    ) : r.reviewerType === "registered" && r.userId ? (
      <Link to={generatePath(PATH.CUSTOMER_DETAIL, { customerId: r.userId })}>{r.displayName}</Link>
    ) : (
      <Link
        to={{
          pathname: PATH.GUEST_BUYER_DETAIL,
          search: new URLSearchParams({ email: r.email }).toString()
        }}
      >
        {r.displayName}
      </Link>
    );

  return (
    <Drawer open title='Chi tiết đánh giá' size='large' onClose={onClose}>
      {loadError ? (
        <Alert type='error' showIcon title={loadError} />
      ) : !review ? (
        <Spin />
      ) : (
        <Flex vertical gap={16}>
          <Flex gap={12} align='center'>
            {review.product?.image && (
              <img
                src={resolveImageUrl(review.product.image)}
                alt=''
                style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 4 }}
              />
            )}
            {review.product?.name ? (
              canReadProduct ? (
                <Link to={generatePath(PATH.PRODUCT_DETAIL, { id: review.product._id })}>
                  <Typography.Text strong>{review.product.name}</Typography.Text>
                </Link>
              ) : (
                <Typography.Text strong>{review.product.name}</Typography.Text>
              )
            ) : (
              <Typography.Text strong>Sản phẩm đã bị xóa</Typography.Text>
            )}
          </Flex>
          <Flex gap={8} align='center'>
            <Rate disabled value={review.rating} />
            <Tag color={STATUS_COLOR[review.status]}>{STATUS_LABEL[review.status]}</Tag>
          </Flex>
          {review.title && <Typography.Text strong>{review.title}</Typography.Text>}
          {review.content && <Typography.Paragraph>{review.content}</Typography.Paragraph>}
          {review.images.length > 0 && (
            <Image.PreviewGroup>
              <Flex gap={8} wrap>
                {review.images.map(src => (
                  <Image key={src} width={88} src={resolveImageUrl(src)} alt='Ảnh đánh giá' />
                ))}
              </Flex>
            </Image.PreviewGroup>
          )}
          <Descriptions
            column={1}
            size='small'
            items={[
              { key: "reviewer", label: "Người đánh giá", children: reviewer(review) },
              { key: "email", label: "Email", children: review.email },
              {
                key: "order",
                label: "Đơn hàng",
                children: review.orderId ? (
                  canReadOrder ? (
                    <Link to={generatePath(PATH.ORDER_DETAIL, { orderId: review.orderId })}>
                      {review.orderNumber ?? review.orderId}
                    </Link>
                  ) : (
                    (review.orderNumber ?? review.orderId)
                  )
                ) : (
                  "—"
                )
              },
              {
                key: "date",
                label: "Ngày gửi",
                children: new Date(review.created_at).toLocaleString("vi-VN")
              }
            ]}
          />
          <Flex gap={8}>
            {REVIEW_NEXT_STATUSES[review.status].map(next => (
              <Button
                key={next}
                type={next === "approved" ? "primary" : "default"}
                danger={next === "rejected"}
                disabled={busy || !canUpdate}
                onClick={() =>
                  act(
                    () => updateReviewStatusAPI(review._id, next, review.contentRevision),
                    next === "approved" ? "Đã duyệt đánh giá" : "Đã từ chối đánh giá",
                    false
                  ).catch(cause => setActionError(getErrorMessage(cause)))
                }
              >
                {next === "approved" ? "Duyệt" : "Từ chối"}
              </Button>
            ))}
          </Flex>
          <Typography.Title level={5} style={{ margin: 0 }}>
            Phản hồi của shop
          </Typography.Title>
          <Alert
            type='info'
            showIcon
            title='Phản hồi chỉ hiển thị cùng đánh giá đã duyệt trên trang sản phẩm.'
          />
          {review.adminReply?.isStale && (
            <Tag color='warning'>Đánh giá đã được cập nhật sau phản hồi này.</Tag>
          )}
          <Input.TextArea
            disabled={busy || !canUpdate}
            aria-label='Nội dung phản hồi'
            value={reply}
            maxLength={2000}
            showCount
            autoSize={{ minRows: 3, maxRows: 8 }}
            onChange={event => setReply(event.target.value)}
          />
          <Flex gap={8}>
            <Button
              type='primary'
              disabled={busy || !canUpdate || !reply.trim()}
              onClick={() =>
                act(
                  () => saveReviewReplyAPI(review._id, reply.trim(), review.contentRevision),
                  "Đã lưu phản hồi",
                  true
                ).catch(cause => setActionError(getErrorMessage(cause)))
              }
            >
              Lưu phản hồi
            </Button>
            {review.adminReply && (
              <Button
                danger
                disabled={busy || !canUpdate}
                onClick={() =>
                  act(() => deleteReviewReplyAPI(review._id), "Đã xóa phản hồi", true).catch(
                    cause => setActionError(getErrorMessage(cause))
                  )
                }
              >
                Xóa phản hồi
              </Button>
            )}
          </Flex>
          {actionError && <Alert type='error' showIcon title={actionError} />}
        </Flex>
      )}
    </Drawer>
  );
}
