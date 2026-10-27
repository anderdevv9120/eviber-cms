import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Input,
  Pagination,
  Rate,
  Select,
  Spin,
  Tabs,
  Tag,
  Typography
} from "antd";
import type { TableProps } from "antd";
import DataTable from "@/components/DataTable";
import viVN from "antd/locale/vi_VN";
import { useSearchParams } from "react-router";
import {
  listReviewsAPI,
  type AdminReview,
  type ReviewListQuery,
  type ReviewListResult,
  type ReviewStatus
} from "@/services/reviews";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { resolveImageUrl } from "@/utils/resolveImageUrl";
import {
  parseReviewListQuery,
  serializeReviewListQuery,
  STATUS_COLOR,
  STATUS_LABEL
} from "./review-list-query";
import ReviewDrawer from "./ReviewDrawer";

export default function Reviews() {
  const [params, setParams] = useSearchParams();
  const query = parseReviewListQuery(params);
  const key = serializeReviewListQuery(query).toString();
  const [result, setResult] = useState<ReviewListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targets = params.getAll("reviewId");
  const selectedId = targets.length === 1 && /^[a-f\d]{24}$/i.test(targets[0]) ? targets[0] : null;
  const selectReview = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("reviewId", id);
    else next.delete("reviewId");
    setParams(next);
  };
  const [reloadKey, setReloadKey] = useState(0);
  // loading suy ra từ key: react-hooks/set-state-in-effect cấm setLoading(true) đồng bộ trong effect
  const requestKey = `${key}#${reloadKey}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const loading = settledKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    listReviewsAPI(parseReviewListQuery(new URLSearchParams(key)), controller.signal)
      .then(res => {
        setResult(res.data);
        setError(null);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(getErrorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettledKey(`${key}#${reloadKey}`);
      });
    return () => controller.abort();
  }, [key, reloadKey]);

  const changeQuery = (patch: Partial<ReviewListQuery>) => {
    const next = serializeReviewListQuery({ ...query, page: 1, ...patch });
    if (selectedId) next.set("reviewId", selectedId);
    setParams(next);
  };

  const columns: NonNullable<TableProps<AdminReview>["columns"]> = [
    {
      title: "Sản phẩm",
      render: (_, row) => (
        <Flex gap={8} align='center'>
          {row.product?.image && (
            <img
              src={resolveImageUrl(row.product.image)}
              alt=''
              style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }}
            />
          )}
          <span>{row.product?.name ?? "Sản phẩm đã bị xóa"}</span>
        </Flex>
      )
    },
    {
      title: "Người đánh giá",
      render: (_, row) => (
        <Flex vertical>
          <span>{row.displayName}</span>
          <Typography.Text type='secondary'>{row.email}</Typography.Text>
        </Flex>
      )
    },
    {
      title: "Số sao",
      width: 150,
      render: (_, row) => <Rate disabled value={row.rating} style={{ fontSize: 14 }} />
    },
    {
      title: "Nội dung",
      render: (_, row) => (
        <Typography.Text ellipsis={{ tooltip: row.content }} style={{ maxWidth: 280 }}>
          {row.title || row.content || "—"}
        </Typography.Text>
      )
    },
    { title: "Ngày gửi", render: (_, row) => new Date(row.created_at).toLocaleDateString("vi-VN") },
    {
      title: "Trạng thái",
      render: (_, row) => <Tag color={STATUS_COLOR[row.status]}>{STATUS_LABEL[row.status]}</Tag>
    },
    {
      title: "Thao tác",
      render: (_, row) => (
        <Button
          aria-label={`Xem đánh giá của ${row.displayName}`}
          onClick={event => {
            event.stopPropagation();
            selectReview(row._id);
          }}
        >
          Xem
        </Button>
      )
    }
  ];

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2} style={{ margin: 0 }}>
        Đánh giá sản phẩm
      </Typography.Title>
      {targets.length > 0 && !selectedId && (
        <Alert type='warning' showIcon title='Đánh giá không còn khả dụng' />
      )}
      <Tabs
        activeKey={query.status}
        onChange={status => changeQuery({ status: status as ReviewStatus })}
        items={(Object.keys(STATUS_LABEL) as ReviewStatus[]).map(status => ({
          key: status,
          label: STATUS_LABEL[status]
        }))}
      />
      <Flex gap={12} wrap>
        <Select
          aria-label='Lọc theo số sao'
          style={{ width: 160 }}
          value={query.rating ?? 0}
          onChange={(rating: number) => changeQuery({ rating: rating || undefined })}
          options={[
            { value: 0, label: "Tất cả số sao" },
            ...[5, 4, 3, 2, 1].map(n => ({ value: n, label: `${n} sao` }))
          ]}
        />
        <SearchBox
          key={query.search ?? ""}
          search={query.search ?? ""}
          onSearch={search => changeQuery({ search: search.trim() || undefined })}
        />
      </Flex>
      {error && (
        <Alert
          type='error'
          showIcon
          title={error}
          action={<Button onClick={() => setReloadKey(k => k + 1)}>Thử lại</Button>}
        />
      )}
      {!result && loading ? (
        <Spin />
      ) : result ? (
        <>
          <DataTable<AdminReview>
            rowKey='_id'
            loading={loading}
            columns={columns}
            dataSource={result.data}
            pagination={false}
            locale={{ emptyText: "Không có đánh giá" }}
            onRow={row => ({ onClick: () => selectReview(row._id), style: { cursor: "pointer" } })}
          />
          <Flex justify='space-between' align='center' wrap gap={12}>
            <Typography.Text>Tổng {result.total} đánh giá</Typography.Text>
            <Pagination
              locale={viVN.Pagination}
              current={query.page}
              pageSize={query.pageSize}
              total={result.total}
              showSizeChanger={false}
              onChange={page => changeQuery({ page })}
            />
          </Flex>
        </>
      ) : null}
      {selectedId && (
        <ReviewDrawer
          key={selectedId}
          reviewId={selectedId}
          onClose={() => selectReview(null)}
          onChanged={() => setReloadKey(k => k + 1)}
        />
      )}
    </Flex>
  );
}

function SearchBox({ search, onSearch }: { search: string; onSearch: (value: string) => void }) {
  const [draft, setDraft] = useState(search);
  return (
    <Input.Search
      aria-label='Tìm đánh giá'
      placeholder='Tên, email hoặc sản phẩm'
      style={{ maxWidth: 360 }}
      maxLength={255}
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onSearch={onSearch}
      enterButton='Tìm kiếm'
    />
  );
}
