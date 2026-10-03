import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Flex, Spin, Table, Typography } from "antd";
import type { TableProps } from "antd";
import { Link, useParams } from "react-router";
import { PATH } from "@/constants/paths";
import { getAttributeValuesAPI } from "@/services/attributes";
import type { AttributeValuesResult, AttributeValueSummary } from "@/services/attributes";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";

const columns: TableProps<AttributeValueSummary>["columns"] = [
  { title: "Vị trí", dataIndex: "sortOrder", render: (position: number) => position + 1 },
  { title: "Giá trị", dataIndex: "value" },
  {
    title: "Màu",
    dataIndex: "meta",
    render: (meta: string | null) =>
      meta ? (
        <Flex align='center' gap={8}>
          <span
            aria-label={`Màu ${meta}`}
            style={{
              backgroundColor: meta,
              width: 20,
              height: 20,
              border: "1px solid #999",
              flexShrink: 0
            }}
          />
          {meta}
        </Flex>
      ) : (
        "Văn bản"
      )
  },
  { title: "Sản phẩm sử dụng", dataIndex: "productUsageCount" },
  { title: "Biến thể sử dụng", dataIndex: "variantUsageCount" }
];
export default function AttributeDetail() {
  const { attributeId } = useParams();
  if (!attributeId) throw new Error("Missing attribute route parameter");
  return <DetailContent key={attributeId} attributeId={attributeId} />;
}
function DetailContent({ attributeId }: { attributeId: string }) {
  const [state, setState] = useState<{
    result: AttributeValuesResult | null;
    error: string | null;
    loading: boolean;
  }>({ result: null, loading: true, error: null });
  const request = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return getAttributeValuesAPI(attributeId, controller.signal)
      .then(({ data }) => {
        if (!data || !data.attribute || !Array.isArray(data.values))
          throw new Error("Không nhận được chi tiết thuộc tính hợp lệ. Vui lòng thử lại.");
        if (!controller.signal.aborted) setState({ result: data, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setState({
            result: null,
            loading: false,
            error:
              cause instanceof ApiError && cause.status === 404
                ? "Thuộc tính không còn khả dụng."
                : getErrorMessage(cause)
          });
      });
  }, [attributeId]);
  const reload = () => {
    setState({ result: null, loading: true, error: null });
    void load();
  };
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  return (
    <section className='min-w-0'>
      <Link to={PATH.ATTRIBUTES}>Về danh sách thuộc tính</Link>
      {state.loading ? (
        <Flex justify='center' className='py-8'>
          <Spin aria-label='Đang tải giá trị' />
        </Flex>
      ) : state.error ? (
        <Alert
          className='mt-4'
          type='error'
          showIcon
          title={state.error}
          action={<Button onClick={() => void reload()}>Thử lại</Button>}
        />
      ) : (
        state.result && (
          <>
            <Typography.Title level={2}>{state.result.attribute.name}</Typography.Title>
            <p className='mb-4'>
              Mã: <Typography.Text code>{state.result.attribute.code}</Typography.Text>
            </p>
            <Table<AttributeValueSummary>
              rowKey='_id'
              columns={columns}
              dataSource={state.result.values}
              pagination={false}
              scroll={{ x: 650 }}
              locale={{ emptyText: "Chưa có giá trị" }}
            />
          </>
        )
      )}
    </section>
  );
}
