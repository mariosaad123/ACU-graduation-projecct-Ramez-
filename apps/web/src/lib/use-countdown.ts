import { useCallback, useEffect, useState } from 'react';

/** Seconds left before something is allowed again, e.g. asking for a new code. */
export function useCountdown(initialSeconds = 0) {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setRemaining((seconds) => Math.max(seconds - 1, 0));
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [remaining]);

  const start = useCallback((seconds: number) => {
    setRemaining(Math.max(Math.ceil(seconds), 0));
  }, []);

  return { remaining, start };
}
