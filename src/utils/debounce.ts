export function debounce<T extends (...args: never[]) => unknown>(
  callback: T,
  delay = 500
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback.apply(this, args);
    }, delay);
  };
}
