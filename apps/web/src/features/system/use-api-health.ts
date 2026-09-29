import { healthResponseSchema } from '@acu/shared';
import { useEffect, useState } from 'react';

export type ApiHealth =
  { state: 'checking' } | { state: 'online'; version: string } | { state: 'offline' };

export function useApiHealth(): ApiHealth {
  const [health, setHealth] = useState<ApiHealth>({ state: 'checking' });

  useEffect(() => {
    const controller = new AbortController();

    async function check(): Promise<void> {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });
        const parsed = healthResponseSchema.safeParse(await response.json());
        setHealth(
          response.ok && parsed.success
            ? { state: 'online', version: parsed.data.version }
            : { state: 'offline' },
        );
      } catch {
        if (!controller.signal.aborted) {
          setHealth({ state: 'offline' });
        }
      }
    }

    void check();
    return () => {
      controller.abort();
    };
  }, []);

  return health;
}
