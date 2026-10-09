import { useEffect, useState } from "react";
import { Button, Flex, Result, Spin, Table, Tag, Typography } from "antd";
import { listPoliciesAPI, type PolicyPageSummary, type PolicySlug } from "@/services/storeContent";
import { getErrorMessage } from "@/utils/getErrorMessage";
import PolicyDrawer from "./PolicyDrawer";

export default function Policies() {
  const [rows, setRows] = useState<PolicyPageSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<PolicySlug | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listPoliciesAPI(controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setRows(data);
        setError(null);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(getErrorMessage(cause));
      });
    return () => controller.abort();
  }, [attempt]);

  const refresh = () => setAttempt(value => value + 1);

  return (
    <Flex vertical gap={16}>
      <Typography.Title level={2}>Trang chính sách</Typography.Title>
      {error && !rows ? (
        <Result
          status='error'
          title='Không tải được danh sách trang'
          subTitle={error}
          extra={<Button onClick={refresh}>Thử lại</Button>}
        />
      ) : !rows ? (
        <Flex justify='center' className='py-16'>
          <Spin />
        </Flex>
      ) : (
        <Table<PolicyPageSummary>
          rowKey='slug'
          dataSource={rows}
          pagination={false}
          columns={[
            { title: "Trang", dataIndex: "title" },
            {
              title: "Trạng thái",
              dataIndex: "isPublished",
              render: (isPublished: boolean) =>
                isPublished ? <Tag color='green'>Đã xuất bản</Tag> : <Tag>Nháp</Tag>
            },
            {
              title: "Cập nhật",
              dataIndex: "updatedAt",
              render: (updatedAt: string | null) =>
                updatedAt ? new Date(updatedAt).toLocaleString("vi-VN") : "Chưa lưu"
            },
            {
              title: "",
              key: "actions",
              render: (_, row) => (
                <Button aria-label={`Sửa ${row.title}`} onClick={() => setEditing(row.slug)}>
                  Sửa
                </Button>
              )
            }
          ]}
        />
      )}
      {editing && (
        <PolicyDrawer slug={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
    </Flex>
  );
}
