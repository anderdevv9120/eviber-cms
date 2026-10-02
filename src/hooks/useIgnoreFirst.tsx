import { useRef, useEffect } from "react";

function useIgnoreFirst(callback: () => void, dependencies: unknown[]) {
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    return callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies]);
}

export default useIgnoreFirst;
