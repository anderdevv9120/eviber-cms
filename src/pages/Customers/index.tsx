import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Input,
  Modal,
  Pagination,
  Select,
  Spin,
  Table,
  Tabs,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import viVN from "antd/locale/vi_VN";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PATH } from "@/constants/paths";
import {
  createCustomerAPI,
  listCustomersAPI,
  listGuestBuyersAPI,
  type CreateCustomerInput,
  type CustomerListQuery,
  type CustomerListResult,
  type CustomerStatus,
  type GuestBuyerSummary,
  type RegisteredCustomerSummary
} from "@/services/customers";
import { ApiError } from "@/utils/request";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { formatOrderDate } from "@/pages/Orders/order-display";
import { parseCustomerListQuery, serializeCustomerListQuery } from "./customer-list-query";
import CustomerForm from "./CustomerForm";

type ListResult =
  CustomerListResult<RegisteredCustomerSummary> | CustomerListResult<GuestBuyerSummary>;
interface ListView {
  key: string;
  result?: ListResult;
  error?: string;
}
const statusLabels: Record<CustomerStatus, string> = {
  VERIFIED: "Đã xác minh",
  UNVERIFIED: "Chưa xác minh",
  DELETED: "Đã xóa"
};
const text = (value?: string) => value?.trim() || "—";
const date = (value?: string) =>
  value && !Number.isNaN(new Date(value).getTime()) ? formatOrderDate(value) : "—";

// Adapted from useOrdersList: one request owns recovery and its canonical URL.
function useCustomersList() {
  const [params, setParams] = useSearchParams();
  const query = parseCustomerListQuery(params);
  const key = serializeCustomerListQuery(query).toString();
  const [view, setView] = useState<ListView>({ key });
  const request = useRef<{ controller: AbortController; key: string } | null>(null);
  // Stable identity makes the network Effect depend on committed query changes.
  const fetchList = useCallback(async (): Promise<ListResult> => {
    request.current?.controller.abort();
    const current = { controller: new AbortController(), key };
    request.current = current;
    const currentQuery = parseCustomerListQuery(new URLSearchParams(key));
    const fetchPage = async (pageQuery: CustomerListQuery) => {
      const { data } = await (pageQuery.tab === "guests" ? listGuestBuyersAPI : listCustomersAPI)(
        pageQuery,
        current.controller.signal
      );
      if (current.controller.signal.aborted || request.current !== current)
        throw new Error("Yêu cầu danh sách đã bị thay thế");
      if (
        !data ||
        !Array.isArray(data.data) ||
        !Number.isSafeInteger(data.total) ||
        data.total < 0 ||
        !Number.isSafeInteger(data.totalPage) ||
        data.totalPage < 0 ||
        data.page !== pageQuery.page ||
        data.pageSize !== pageQuery.pageSize
      )
        throw new Error("Không nhận được danh sách khách hàng hợp lệ. Vui lòng thử lại.");
      return data;
    };
    try {
      let data = await fetchPage(currentQuery);
      const lastPage = Math.max(1, data.totalPage);
      if (currentQuery.page > lastPage) {
        const recovered = { ...currentQuery, page: lastPage };
        const recoveredParams = serializeCustomerListQuery(recovered);
        current.key = recoveredParams.toString();
        setParams(recoveredParams, { replace: true });
        data = await fetchPage(recovered);
      }
      setView({ key: current.key, result: data });
      return data;
    } catch (cause) {
      if (!current.controller.signal.aborted && request.current === current)
        setView({ key: current.key, error: getErrorMessage(cause) });
      throw cause;
    }
  }, [key, setParams]);

  useEffect(() => {
    if (request.current?.key !== key)
      fetchList().catch(() => {
        // Active failures are shown inline; cancelled reads remain silent.
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

  const changeQuery = (changes: Partial<CustomerListQuery>) => {
    setParams(previous => {
      const next = { ...parseCustomerListQuery(previous), ...changes };
      if (["tab", "search", "status", "pageSize"].some(field => field in changes)) next.page = 1;
      return serializeCustomerListQuery(next);
    });
  };
  const reload = () => {
    setView({ key });
    return fetchList();
  };
  const currentView = view.key === key ? view : undefined;
  return {
    query,
    key,
    result: currentView?.result,
    error: currentView?.error,
    loading: !currentView?.result && !currentView?.error,
    changeQuery,
    reload,
    isCurrent: () => request.current?.key === key && !request.current.controller.signal.aborted
  };
}

export default function Customers() {
  const navigate = useNavigate();
  const { query, key, result, error, loading, changeQuery, reload, isCurrent } = useCustomersList();
  const listSearch = serializeCustomerListQuery(query).toString();
  const returnTo = listSearch ? `${PATH.CUSTOMERS}?${listSearch}` : PATH.CUSTOMERS;
  const registeredLink = (id: string) => ({
    pathname: PATH.CUSTOMER_DETAIL.replace(":customerId", encodeURIComponent(id)),
    search: new URLSearchParams({ returnTo }).toString()
  });
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [recovery, setRecovery] = useState<{ email: string; searched: boolean } | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reviewed =
    !!recovery?.searched &&
    query.tab === "registered" &&
    query.search === recovery.email &&
    !query.status &&
    !loading &&
    !!result;
  const createBlocked = saving || (!!recovery && !reviewed);
  const closeCreate = () => {
    if (!savingRef.current) setCreating(false);
  };
  const refresh = () => {
    reload().catch(() => {
      /* Read failure is shown inline. */
    });
  };
  const searchAfterCreation = () => {
    if (!recovery) return;
    const next: CustomerListQuery = {
      tab: "registered",
      page: 1,
      pageSize: query.pageSize,
      search: recovery.email
    };
    setCreating(false);
    setRecovery({ ...recovery, searched: true });
    if (serializeCustomerListQuery(next).toString() === key) refresh();
    else changeQuery({ ...next, status: undefined });
  };
  const create = async (input: CreateCustomerInput) => {
    if (recovery || savingRef.current) return;
    let createdId: string;
    savingRef.current = true;
    setSaving(true);
    try {
      const { data } = await createCustomerAPI(input);
      if (
        !data ||
        typeof data._id !== "string" ||
        !data._id ||
        data.status !== "UNVERIFIED" ||
        data.accountType !== "DEFAULT"
      )
        throw new Error("Chưa xác nhận được kết quả tạo khách hàng.");
      createdId = data._id;
    } catch (cause) {
      if (
        mounted.current &&
        (!(cause instanceof ApiError) || cause.status === undefined || cause.status >= 500)
      )
        setRecovery({ email: input.email.trim().toLowerCase(), searched: false });
      throw cause;
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
    if (!mounted.current) return;
    setCreating(false);
    if (isCurrent()) navigate(registeredLink(createdId));
  };

  const registeredColumns: TableColumnsType<RegisteredCustomerSummary> = [
    {
      title: "Tên",
      key: "name",
      render: (_, row) => text([row.firstName, row.lastName].filter(Boolean).join(" "))
    },
    { title: "Email", dataIndex: "email" },
    { title: "Số điện thoại", key: "phone", render: (_, row) => text(row.phone) },
    { title: "Trạng thái", key: "status", render: (_, row) => statusLabels[row.status] ?? "—" },
    {
      title: "Loại tài khoản",
      key: "account",
      render: (_, row) =>
        row.accountType === "DEFAULT"
          ? "Email / mật khẩu"
          : row.accountType === "GOOGLE"
            ? "Google"
            : "—"
    },
    { title: "Ngày tạo", key: "created", render: (_, row) => date(row.created_at) },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, row) => <Link to={registeredLink(row._id)}>Chi tiết</Link>
    }
  ];
  const guestColumns: TableColumnsType<GuestBuyerSummary> = [
    { title: "Email", dataIndex: "email" },
    { title: "Tên liên hệ gần nhất", key: "name", render: (_, row) => text(row.name) },
    { title: "Số điện thoại gần nhất", key: "phone", render: (_, row) => text(row.phoneNumber) },
    { title: "Đơn hàng gần nhất", key: "latest", render: (_, row) => date(row.latestOrderAt) },
    { title: "Số đơn hàng", dataIndex: "orderCount" },
    {
      title: "Thao tác",
      key: "actions",
      render: (_, row) => (
        <Link
          to={{
            pathname: PATH.GUEST_BUYER_DETAIL,
            search: new URLSearchParams({
              email: row.email.trim().toLowerCase(),
              returnTo
            }).toString()
          }}
        >
          Chi tiết
        </Link>
      )
    }
  ];

  return (
    <section className='min-w-0'>
      <Flex justify='space-between' align='center' gap={12} wrap>
        <Typography.Title level={2}>Khách hàng</Typography.Title>
        <Flex gap={8}>
          <Button onClick={refresh} disabled={loading}>
            Tải lại
          </Button>
          {query.tab === "registered" && (
            <Button
              type='primary'
              disabled={createBlocked}
              onClick={() => {
                setRecovery(null);
                setCreating(true);
              }}
            >
              Thêm khách hàng
            </Button>
          )}
        </Flex>
      </Flex>
      {/* Task 6 mounts the persisted checkout setting here, independently of the lists. */}
      <Tabs
        activeKey={query.tab}
        onChange={tab => changeQuery({ tab: tab === "guests" ? "guests" : "registered" })}
        items={[
          { key: "registered", label: "Đã đăng ký" },
          { key: "guests", label: "Khách vãng lai" }
        ]}
      />
      <Flex gap={12} wrap className='mb-4'>
        <CustomerSearch
          key={query.search ?? ""}
          search={query.search ?? ""}
          onSearch={search => changeQuery({ search })}
        />
        {query.tab === "registered" && (
          <Select<CustomerStatus | "">
            aria-label='Lọc trạng thái khách hàng'
            style={{ minWidth: 200 }}
            value={query.status ?? ""}
            onChange={status => changeQuery({ status: status || undefined })}
            options={[
              { value: "", label: "Tất cả trạng thái" },
              ...Object.entries(statusLabels).map(([value, label]) => ({
                value: value as CustomerStatus,
                label
              }))
            ]}
          />
        )}
      </Flex>
      {recovery && !creating && (
        <Alert
          type='warning'
          showIcon
          className='mb-4'
          title={
            reviewed
              ? "Đã tải kết quả tìm email. Kiểm tra tài khoản hiện có trước khi mở lại biểu mẫu tạo."
              : "Yêu cầu tạo có thể đã được lưu. Tìm email đã gửi và kiểm tra kết quả trước khi tạo lại."
          }
          action={<Button onClick={searchAfterCreation}>Tìm email đã gửi</Button>}
        />
      )}
      {loading && (
        <Flex justify='center' className='py-8'>
          <Spin aria-label='Đang tải danh sách khách hàng' />
        </Flex>
      )}
      {error && (
        <Alert
          type='error'
          showIcon
          title={error}
          action={<Button onClick={refresh}>Thử lại</Button>}
        />
      )}
      {!loading && result && (
        <>
          {query.tab === "registered" ? (
            <Table<RegisteredCustomerSummary>
              rowKey='_id'
              columns={registeredColumns}
              dataSource={result.data as RegisteredCustomerSummary[]}
              pagination={false}
              locale={{ emptyText: "Không có khách hàng" }}
            />
          ) : (
            <Table<GuestBuyerSummary>
              rowKey='email'
              columns={guestColumns}
              dataSource={result.data as GuestBuyerSummary[]}
              pagination={false}
              locale={{ emptyText: "Không có khách hàng" }}
            />
          )}
          <Flex justify='space-between' align='center' wrap gap={12} className='mt-4'>
            <Typography.Text>Tổng {result.total} khách hàng</Typography.Text>
            <Pagination
              locale={viVN.Pagination}
              current={query.page}
              pageSize={query.pageSize}
              total={result.total}
              showSizeChanger={{ "aria-label": "Số khách hàng mỗi trang" }}
              pageSizeOptions={[10, 20, 50]}
              onChange={(page, pageSize) =>
                changeQuery(pageSize !== query.pageSize ? { pageSize } : { page })
              }
            />
          </Flex>
        </>
      )}
      {creating && (
        <Modal
          open
          title='Thêm khách hàng'
          footer={null}
          closable={!saving}
          keyboard={!saving}
          mask={{ closable: !saving }}
          onCancel={closeCreate}
        >
          {recovery && (
            <Alert
              type='warning'
              showIcon
              className='mb-4'
              title='Yêu cầu tạo có thể đã được lưu. Tìm email đã gửi và kiểm tra kết quả trước khi tạo lại.'
              action={<Button onClick={searchAfterCreation}>Tìm email đã gửi</Button>}
            />
          )}
          <CustomerForm
            disabled={!!recovery}
            onCancel={closeCreate}
            onSubmit={async input => {
              if ("email" in input) await create(input);
            }}
          />
        </Modal>
      )}
    </section>
  );
}

function CustomerSearch({
  search,
  onSearch
}: {
  search: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(search);
  return (
    <Input.Search
      aria-label='Tìm khách hàng'
      placeholder='Tên, email hoặc số điện thoại'
      maxLength={255}
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onSearch={onSearch}
      enterButton='Tìm kiếm'
    />
  );
}
