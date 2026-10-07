import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { listOrdersAPI, type OrderListQuery, type OrderListResult } from "@/services/orders";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { parseOrderListQuery, serializeOrderListQuery } from "./order-list-query";

interface ListView {
  key: string;
  result?: OrderListResult;
  error?: string;
}

export function useOrdersList() {
  const [params, setParams] = useSearchParams();
  const query = parseOrderListQuery(params);
  const key = serializeOrderListQuery(query).toString();
  const [view, setView] = useState<ListView>({ key });
  const request = useRef<{ controller: AbortController; key: string } | null>(null);

  // Stable identity lets the network Effect run only when the committed query changes.
  const fetchList = useCallback(async (): Promise<OrderListResult> => {
    request.current?.controller.abort();
    const current = { controller: new AbortController(), key };
    request.current = current;
    const currentQuery = parseOrderListQuery(new URLSearchParams(key));
    const fetchPage = async (pageQuery: OrderListQuery) => {
      const { data } = await listOrdersAPI(pageQuery, current.controller.signal);
      if (current.controller.signal.aborted || request.current !== current)
        throw new Error("Yêu cầu danh sách đã bị thay thế");
      if (!data || !Array.isArray(data.data))
        throw new Error("Không nhận được danh sách đơn hàng hợp lệ. Vui lòng thử lại.");
      return data;
    };
    try {
      let data = await fetchPage(currentQuery);
      const lastPage = Math.max(1, data.totalPage);
      if ((currentQuery.page ?? 1) > lastPage) {
        const recovered = { ...currentQuery, page: lastPage };
        const recoveredParams = serializeOrderListQuery(recovered);
        // Keep recovery in this promise; the URL Effect must not issue a duplicate read.
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
        // Active read failures are displayed by fetchList; cancelled reads stay silent.
      });
    return () => {
      if (request.current?.key !== key) return;
      request.current?.controller.abort();
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

  const changeQuery = (changes: OrderListQuery) => {
    setParams(previous => {
      const next = { ...parseOrderListQuery(previous), ...changes };
      if (
        ["search", "status", "paymentStatus", "attention", "pageSize"].some(
          field => field in changes
        )
      )
        next.page = 1;
      return serializeOrderListQuery(next);
    });
  };
  const reload = () => {
    setView({ key });
    return fetchList();
  };
  const currentView = view.key === key ? view : undefined;
  return {
    query,
    result: currentView?.result,
    loading: !currentView?.result && !currentView?.error,
    error: currentView?.error,
    changeQuery,
    reload
  };
}
