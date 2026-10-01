import { useEffect, useRef } from "react";

function useDebounce(callback: () => void, delay = 500) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const timer = setTimeout(() => callbackRef.current(), delay);

    return () => {
      clearTimeout(timer);
    };
  }, [delay]);
}

export default useDebounce;
