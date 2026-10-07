import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from "react-router";
import { AxiosError, type AxiosResponse } from "axios";
import type { ReactNode } from "react";
import axiosRequest from "@/utils/request";
import { deferred, order, orderList, response } from "@/test/order-fixtures";
import { useOrdersList } from "./useOrdersList";

function setup(path = "/orders") {
  let navigate!: NavigateFunction;
  const view = renderHook(
    () => {
      navigate = useNavigate();
      return { ...useOrdersList(), location: useLocation() };
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      )
    }
  );
  return { ...view, navigate: (to: string) => navigate(to) };
}

describe("URL-driven order reads", () => {
  it("sends one combined server query and unwraps one envelope", async () => {
    const requests: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.params);
      expect(config.url).toBe("/orders");
      expect(config.toastError).toBe(false);
      expect(config.signal).toBeTruthy();
      return response(config, orderList([order], 3, 65, 20));
    };
    const { result } = setup(
      "/orders?page=3&pageSize=20&search=An&status=cancelled&paymentStatus=paid"
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests).toEqual([
      { page: 3, pageSize: 20, search: "An", status: "cancelled", paymentStatus: "paid" }
    ]);
    expect(result.current.result?.total).toBe(65);
    expect(result.current.result?.data[0]._id).toBe(order._id);
  });

  it("restores deep links and resets page for filters/search/size", async () => {
    axiosRequest.defaults.adapter = async config =>
      response(config, orderList([order], config.params.page, 100, config.params.pageSize));
    const { result } = setup("/orders?page=3&search=Old&status=pending&paymentStatus=unpaid");
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.changeQuery({ search: "New" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.query).toEqual({
      page: 1,
      pageSize: 10,
      search: "New",
      status: "pending",
      paymentStatus: "unpaid"
    });
    await act(() => result.current.changeQuery({ page: 3 }));
    await act(() => result.current.changeQuery({ pageSize: 20 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.query.page).toBe(1);
    expect(result.current.location.search).toBe(
      "?pageSize=20&search=New&status=pending&paymentStatus=unpaid"
    );
    await act(() => result.current.changeQuery({ page: 2 }));
    await act(() => result.current.changeQuery({ status: undefined }));
    expect(result.current.query.page).toBe(1);
    expect(result.current.query.status).toBeUndefined();
  });

  it("sends attention with other filters, resets page on attention change and keeps it otherwise", async () => {
    const requests: unknown[] = [];
    axiosRequest.defaults.adapter = async config => {
      requests.push(config.params);
      return response(config, orderList([order], config.params.page, 100, config.params.pageSize));
    };
    const { result } = setup("/payments?page=3&status=pending&attention=awaiting-transfer");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(requests).toEqual([
      { page: 3, pageSize: 10, status: "pending", attention: "awaiting-transfer" }
    ]);
    await act(() => result.current.changeQuery({ search: "An" }));
    await act(() => result.current.changeQuery({ page: 4 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location.search).toBe(
      "?page=4&search=An&status=pending&attention=awaiting-transfer"
    );
    await act(() => result.current.changeQuery({ attention: "refund-needed" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location.search).toBe(
      "?search=An&status=pending&attention=refund-needed"
    );
    await act(() => result.current.changeQuery({ page: 2 }));
    await act(() => result.current.changeQuery({ attention: undefined }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location.search).toBe("?search=An&status=pending");
    expect(requests[requests.length - 1]).toEqual({
      page: 1,
      pageSize: 10,
      search: "An",
      status: "pending"
    });
  });

  it.each([1, 0])("recovers page 3 to page 1 once for total %s", async total => {
    const pages: number[] = [];
    axiosRequest.defaults.adapter = async config => {
      pages.push(config.params.page);
      return response(
        config,
        orderList(config.params.page === 1 && total ? [order] : [], config.params.page, total)
      );
    };
    const { result } = setup("/orders?page=3&status=cancelled");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location.search).toBe("?status=cancelled");
    expect(result.current.result?.total).toBe(total);
    expect(result.current.result?.data).toHaveLength(total);
    expect(pages).toEqual([3, 1]);
  });

  it("recovers an out-of-range page to the last valid page once", async () => {
    const pages: number[] = [];
    axiosRequest.defaults.adapter = async config => {
      pages.push(config.params.page);
      return response(
        config,
        orderList(config.params.page === 3 ? [order] : [], config.params.page, 25, 10)
      );
    };
    const { result } = setup("/orders?page=9&status=cancelled");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location.search).toBe("?page=3&status=cancelled");
    expect(result.current.result?.data).toHaveLength(1);
    expect(pages).toEqual([9, 3]);
  });

  it("reload returns fresh data and rejects failures without showing an empty result", async () => {
    let fail = false;
    let reads = 0;
    axiosRequest.defaults.adapter = async config => {
      reads++;
      if (fail) throw new AxiosError("offline", AxiosError.ERR_NETWORK, config);
      return response(config, orderList([{ ...order, revision: reads }]));
    };
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    let fresh;
    await act(async () => {
      fresh = await result.current.reload();
    });
    expect(fresh).toEqual(orderList([{ ...order, revision: 2 }]));
    fail = true;
    await act(async () => {
      await expect(result.current.reload()).rejects.toThrow();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.result).toBeUndefined();
  });

  it.each([false, true])(
    "waits for page recovery on reload and propagates recovery failure (%s)",
    async failRecovery => {
      const pages: number[] = [];
      let shrunk = false;
      axiosRequest.defaults.adapter = async config => {
        pages.push(config.params.page);
        if (shrunk && config.params.page === 1 && failRecovery)
          throw new AxiosError("offline", AxiosError.ERR_NETWORK, config);
        return response(
          config,
          orderList(config.params.page === 1 ? [order] : [], config.params.page, shrunk ? 1 : 25)
        );
      };
      const { result } = setup("/orders?page=3&status=pending");
      await waitFor(() => expect(result.current.loading).toBe(false));
      shrunk = true;
      await act(async () => {
        if (failRecovery) await expect(result.current.reload()).rejects.toThrow();
        else expect((await result.current.reload()).page).toBe(1);
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.location.search).toBe("?status=pending");
      expect(pages).toEqual([3, 3, 1]);
      if (failRecovery) expect(result.current.error).toBeTruthy();
      else expect(result.current.result?.data[0]._id).toBe(order._id);
    }
  );

  it("aborts superseded reads and ignores delayed results on navigation/unmount", async () => {
    const delayed = deferred<AxiosResponse>();
    let stale: Parameters<typeof response>[0] | undefined;
    axiosRequest.defaults.adapter = async config => {
      if (config.params.search === "Old") {
        stale = config;
        return delayed.promise;
      }
      return response(config, orderList([{ ...order, orderNumber: "CURRENT" }]));
    };
    const { result, navigate, unmount } = setup("/orders?search=Old");
    await waitFor(() => expect(stale).toBeTruthy());
    await act(() => navigate("/orders?search=New"));
    await waitFor(() => expect(result.current.result?.data[0].orderNumber).toBe("CURRENT"));
    expect(stale!.signal!.aborted).toBe(true);
    await act(async () =>
      delayed.resolve(response(stale!, orderList([{ ...order, orderNumber: "STALE" }])))
    );
    expect(result.current.query.search).toBe("New");
    expect(result.current.result?.data[0].orderNumber).toBe("CURRENT");
    unmount();
  });

  it("cancels a pending reload when unmounted", async () => {
    let config: Parameters<typeof response>[0] | undefined;
    const delayed = deferred<AxiosResponse>();
    axiosRequest.defaults.adapter = async current => {
      config = current;
      return delayed.promise;
    };
    const { unmount } = setup();
    await waitFor(() => expect(config).toBeTruthy());
    unmount();
    expect(config!.signal!.aborted).toBe(true);
    await act(async () => delayed.resolve(response(config!, orderList())));
  });

  it("rejects superseded same-query reloads without replacing the newest result", async () => {
    const delayed = deferred<AxiosResponse>();
    let stale: Parameters<typeof response>[0] | undefined;
    let reads = 0;
    axiosRequest.defaults.adapter = async config => {
      if (++reads === 2) {
        stale = config;
        return delayed.promise;
      }
      return response(
        config,
        orderList([{ ...order, orderNumber: reads === 1 ? "INITIAL" : "NEWEST" }])
      );
    };
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    let oldReload!: Promise<unknown>;
    act(() => {
      oldReload = result.current.reload().catch(cause => cause);
    });
    await waitFor(() => expect(stale).toBeTruthy());
    await act(async () => {
      await result.current.reload();
    });
    expect(stale!.signal!.aborted).toBe(true);
    await act(async () => {
      delayed.resolve(response(stale!, orderList([{ ...order, orderNumber: "STALE" }])));
      await oldReload;
    });
    expect(result.current.result?.data[0].orderNumber).toBe("NEWEST");
    expect(result.current.error).toBeUndefined();
  });

  it("makes malformed list envelopes retryable", async () => {
    axiosRequest.defaults.adapter = async config => response(config, null);
    const { result } = setup();
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.result).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });
});
