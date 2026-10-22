import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/utils/getErrorMessage";

interface ReadView<T> {
  key: string;
  data?: T;
  error?: string;
}

/**
 * Network-only read of a committed key, copied from the useOrdersList pattern: a newer key
 * aborts and ignores the older read, and unmounting aborts. A null key reads nothing.
 * `recover` may redirect one read once (a page that no longer exists); `commitRecovered`
 * records that key, which the same read then loads, so the key Effect issues no duplicate.
 */
export function useKeyedRead<T>(
  key: string | null,
  load: (key: string, signal: AbortSignal) => Promise<T>,
  recover?: (key: string, data: T) => string | null,
  commitRecovered?: (key: string) => void
) {
  const [view, setView] = useState<ReadView<T> | null>(null);
  const request = useRef<{ controller: AbortController; key: string } | null>(null);

  // Stable identity lets the network Effect run only when the committed key changes.
  const fetchRead = useCallback(async () => {
    if (key === null) return;
    request.current?.controller.abort();
    const current = { controller: new AbortController(), key };
    request.current = current;
    const active = () => !current.controller.signal.aborted && request.current === current;
    try {
      let data = await load(key, current.controller.signal);
      const recovered = active() ? recover?.(key, data) : null;
      if (recovered) {
        current.key = recovered;
        commitRecovered?.(recovered);
        data = await load(recovered, current.controller.signal);
      }
      if (active()) setView({ key: current.key, data });
    } catch (cause) {
      if (active()) setView({ key: current.key, error: getErrorMessage(cause) });
      throw cause;
    }
  }, [key, load, recover, commitRecovered]);

  useEffect(() => {
    if (key !== null && request.current?.key !== key)
      fetchRead().catch(() => {
        // Active read failures are displayed by fetchRead; cancelled reads stay silent.
      });
    return () => {
      if (request.current?.key !== key) return;
      request.current?.controller.abort();
      request.current = null;
    };
  }, [fetchRead, key]);

  useEffect(
    () => () => {
      request.current?.controller.abort();
      request.current = null;
    },
    []
  );

  const reload = () => {
    if (key === null) return Promise.resolve();
    setView({ key });
    return fetchRead();
  };
  const current = key !== null && view?.key === key ? view : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: key !== null && !current?.data && !current?.error,
    reload
  };
}
