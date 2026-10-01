import { useState } from "react";

// Pattern "state during render" (docs React) thay cho đọc ref.current lúc render (React Compiler cấm)
export function usePrevious<T>(value: T): T | undefined {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState<T | undefined>(undefined);
  if (!Object.is(value, current)) {
    setPrevious(current);
    setCurrent(value);
  }
  return previous;
}
