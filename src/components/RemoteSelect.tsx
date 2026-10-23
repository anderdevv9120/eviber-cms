import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Flex, Pagination, Select } from "antd";
import { getErrorMessage } from "@/utils/getErrorMessage";

export interface RemoteSelectQuery {
  search: string;
  page: number;
  pageSize: number;
}

export interface RemoteSelectPage<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RemoteSelectProps<T extends { _id: string }> {
  load: (query: RemoteSelectQuery, signal: AbortSignal) => Promise<RemoteSelectPage<T>>;
  label: (item: T) => ReactNode;
  mode?: "multiple";
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  selected?: Array<{ _id: string; label: string }>;
  placeholder?: string;
  disabled?: (item: T) => boolean;
  retryLabel: string;
  ariaLabel?: string;
}

export default function RemoteSelect<T extends { _id: string }>({
  load,
  label,
  mode,
  value,
  onChange,
  selected = [],
  placeholder,
  disabled,
  retryLabel,
  ariaLabel
}: RemoteSelectProps<T>) {
  const [query, setQuery] = useState({ search: "", page: 1, pageSize: 10 });
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<{ result?: RemoteSelectPage<T>; error?: string }>({});
  const [retained, setRetained] = useState<Array<{ _id: string; label: ReactNode }>>(selected);
  useEffect(() => {
    const controller = new AbortController();
    load(query, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setView({ result });
      })
      .catch(cause => {
        if (!controller.signal.aborted) setView({ error: getErrorMessage(cause) });
      });
    return () => controller.abort();
  }, [load, query, attempt]);
  const targets = new Map<string, { _id: string; label: ReactNode; disabled?: boolean }>(
    retained.map(target => [target._id, target])
  );
  for (const item of view.result?.data ?? [])
    targets.set(item._id, { _id: item._id, label: label(item), disabled: disabled?.(item) });
  const ids = Array.isArray(value) ? value : value ? [value] : [];
  for (const id of ids)
    if (!targets.has(id)) targets.set(id, { _id: id, label: `Không còn khả dụng (${id})` });
  const options = [...targets.values()].map(target => ({
    value: target._id,
    label: target.label,
    disabled: target.disabled
  }));
  const changeQuery = (search: string, page = 1) => {
    setView({});
    setQuery({ ...query, search, page });
  };
  return (
    <Flex vertical gap={8}>
      {view.error && (
        <Alert
          type='error'
          title={view.error}
          action={
            <Button
              onClick={() => {
                setView({});
                setAttempt(n => n + 1);
              }}
            >
              {retryLabel}
            </Button>
          }
        />
      )}
      <Select
        aria-label={ariaLabel}
        mode={mode}
        placeholder={placeholder}
        // Server-side search: the API pages targets, so the Select must not filter locally.
        showSearch={{
          searchValue: query.search,
          onSearch: search => changeQuery(search.slice(0, 255)),
          filterOption: false,
          autoClearSearchValue: false
        }}
        loading={!view.result && !view.error}
        value={mode === "multiple" ? ids : value}
        options={options}
        onChange={next => {
          const nextIds = Array.isArray(next) ? next : next ? [next] : [];
          setRetained(
            nextIds.flatMap(id => {
              const target = targets.get(id);
              return target ? [{ _id: target._id, label: target.label }] : [];
            })
          );
          onChange?.(next);
        }}
        popupRender={menu => (
          <>
            {menu}
            {view.result && view.result.total > query.pageSize && (
              // Keep focus in the Select so paging does not close the popup.
              <div className='px-2 pt-2' onMouseDown={event => event.preventDefault()}>
                <Pagination
                  size='small'
                  current={query.page}
                  pageSize={query.pageSize}
                  total={view.result.total}
                  showSizeChanger={false}
                  onChange={page => changeQuery(query.search, page)}
                />
              </div>
            )}
          </>
        )}
      />
    </Flex>
  );
}
