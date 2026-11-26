import { useEffect, useState } from 'react';

/**
 * Debounces rapidly changing values (e.g. search inputs) to avoid
 * redundant filtering passes or API calls on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 220): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebouncedValue(value);
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
