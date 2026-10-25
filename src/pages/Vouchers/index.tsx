import { canAccess } from "@/utils/access";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Flex, Input, Pagination, Select, Spin, Typography } from "antd";
import type { TableColumnsType } from "antd";
import DataTable from "@/components/DataTable";
import viVN from "antd/locale/vi_VN";
import { useSearchParams } from "react-router";
import {
  listVouchersAPI,
  type AdminCouponSummary,
  type VoucherListQuery,
  type VoucherPage
} from "@/services/vouchers";
import { useAppStore } from "@/store/useAppStore";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { formatOrderAmount } from "@/pages/Orders/order-display";
import {
  availabilityLabels,
  checkVoucherPage,
  parseVoucherQuery,
  serializeVoucherQuery,
  voucherDisplayDate
} from "./voucher-query";
import VoucherDrawer from "./VoucherDrawer";

// Copied from Customers: one request owns recovery and its canonical URL.
function useVouchersList() {
  const [params, setParams] = useSearchParams();
  const query = parseVoucherQuery(params);
  const key = serializeVoucherQuery(query).toString();
  const [view, setView] = useState<{
    key: string;
    result?: VoucherPage<AdminCouponSummary>;
    error?: string;
  }>({ key });
  const request = useRef<{ controller: AbortController; key: string } | null>(null);
  const fetchList = useCallback(async () => {
    request.current?.controller.abort();
    const current = { controller: new AbortController(), key };
    request.current = current;
    const currentQuery = parseVoucherQuery(new URLSearchParams(key));
    const fetchPage = async (pageQuery: VoucherListQuery) => {
      const { data } = await listVouchersAPI(pageQuery, current.controller.signal);
      if (current.controller.signal.aborted || request.current !== current)
        throw new Error("Yêu cầu đã bị thay thế");
      return checkVoucherPage(data, pageQuery);
    };
    try {
      let data = await fetchPage(currentQuery);
      const lastPage = Math.max(1, data.totalPage);
      if (currentQuery.page > lastPage) {
        const recovered = { ...currentQuery, page: lastPage };
        const recoveredParams = serializeVoucherQuery(recovered);
        current.key = recoveredParams.toString();
        setParams(recoveredParams, { replace: true });
        data = await fetchPage(recovered);
      }
      setView({ key: current.key, result: data });
    } catch (cause) {
      if (!current.controller.signal.aborted && request.current === current)
        setView({ key: current.key, error: getErrorMessage(cause) });
    }
  }, [key, setParams]);
  useEffect(() => {
    if (request.current?.key !== key)
      fetchList().catch(() => {
        /* Active errors are inline. */
      });
    return () => {
      if (request.current?.key !== key) return;
      request.current.controller.abort();
      request.current = null;
    };
  }, [fetchList, key]);
  useEffect(
    () => () => {
      request.current?.controller.abort();
      request.current = null;
    },
    []
  );
  const changeQuery = (changes: Partial<VoucherListQuery>) =>
    setParams(previous => {
      const next = { ...parseVoucherQuery(previous), ...changes };
      if (["search", "availability", "pageSize"].some(field => field in changes)) next.page = 1;
      return serializeVoucherQuery(next);
    });
  const reload = () => {
    setView({ key });
    fetchList().catch(() => {
      /* Active errors are inline. */
    });
  };
  const current = view.key === key ? view : { key };
  return { query, changeQuery, reload, ...current };
}

function VoucherPage() {
  const profile = useAppStore(state => state.profile);
  const canCreate = !!profile && canAccess(profile, { anyOf: ["COUPON_CREATE"] });
  const { query, key, changeQuery, reload, result, error } = useVouchersList();
  const [selection, setSelection] = useState<{ id: string | null; session: number } | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);
  const columns: TableColumnsType<AdminCouponSummary> = [
    {
      title: "Mã",
      key: "code",
      render: (_, row) => (
        <Button
          type='link'
          className='px-0'
          onClick={() => setSelection({ id: row._id, session: Date.now() })}
        >
          {row.code}
        </Button>
      )
    },
    { title: "Tên", dataIndex: "name" },
    {
      title: "Giảm",
      key: "discount",
      render: (_, row) =>
        row.discountType === "percentage"
          ? `${row.discountValue}%`
          : formatOrderAmount(row.discountValue, "VND")
    },
    {
      title: "Tình trạng",
      key: "availability",
      render: (_, row) => availabilityLabels[row.availability]
    },
    { title: "Đã dùng", dataIndex: "usedCount" },
    {
      title: "Còn lại",
      key: "remaining",
      render: (_, row) => (row.remainingUses === null ? "Không giới hạn" : row.remainingUses)
    },
    {
      title: "Thời điểm có hiệu lực",
      key: "start",
      render: (_, row) => voucherDisplayDate(row.startDate)
    },
    {
      title: "Thời điểm kết thúc",
      key: "end",
      render: (_, row) => voucherDisplayDate(row.endDate)
    }
  ];
  return (
    <section className='min-w-0'>
      <Typography.Title level={2}>Voucher</Typography.Title>
      <div role='status' aria-live='polite' aria-atomic='true'>
        {savedVersion > 0 && (
          <Alert
            key={savedVersion}
            role='presentation'
            type='success'
            title='Đã lưu voucher thành công'
            className='mb-4'
          />
        )}
      </div>
      <Flex gap={12} wrap align='center' className='mb-4'>
        <Input.Search
          key={key}
          aria-label='Tìm voucher'
          defaultValue={query.search}
          maxLength={255}
          enterButton='Tìm kiếm'
          style={{ maxWidth: 400 }}
          onSearch={search => changeQuery({ search: search.trim() || undefined })}
        />
        <Select
          aria-label='Lọc tình trạng voucher'
          value={query.availability}
          allowClear
          placeholder='Tất cả tình trạng'
          style={{ width: 220 }}
          options={Object.entries(availabilityLabels).map(([value, label]) => ({ value, label }))}
          onChange={availability => changeQuery({ availability })}
        />
        <Flex gap={8} className='ml-auto'>
          <Button onClick={reload} disabled={!result && !error}>
            Tải lại
          </Button>
          <Button
            type='primary'
            disabled={!canCreate}
            onClick={() => {
              if (canCreate) setSelection({ id: null, session: Date.now() });
            }}
          >
            Thêm voucher
          </Button>
        </Flex>
      </Flex>
      {error ? (
        <Alert type='error' title={error} action={<Button onClick={reload}>Thử lại</Button>} />
      ) : !result ? (
        <Spin aria-label='Đang tải voucher' />
      ) : (
        <>
          <DataTable
            rowKey='_id'
            columns={columns}
            dataSource={result.data}
            pagination={false}
            locale={{ emptyText: "Không có voucher" }}
          />
          <Flex justify='space-between' wrap gap={12} className='mt-4'>
            <Typography.Text>Tổng {result.total} voucher</Typography.Text>
            <Pagination
              locale={viVN.Pagination}
              current={query.page}
              pageSize={query.pageSize}
              total={result.total}
              showSizeChanger
              pageSizeOptions={[10, 20, 50, 100]}
              onChange={(page, pageSize) =>
                changeQuery(pageSize === query.pageSize ? { page } : { pageSize })
              }
            />
          </Flex>
        </>
      )}
      {selection && (
        <VoucherDrawer
          key={`${selection.id ?? "new"}:${selection.session}`}
          voucherId={selection.id}
          onClose={() => setSelection(null)}
          onChanged={() => {
            setSavedVersion(version => version + 1);
            reload();
          }}
        />
      )}
    </section>
  );
}

export default function Vouchers() {
  const accountId = useAppStore(state => state.profile?._id);
  return accountId ? <VoucherPage key={accountId} /> : null;
}
