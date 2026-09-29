import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

function stubFetch(implementation: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(implementation));
}

describe('App', () => {
  it('shows the API version when the health check succeeds', async () => {
    stubFetch(async () =>
      Response.json({ status: 'ok', version: '1.2.3', uptimeSeconds: 10 }),
    );

    render(<App />);

    expect(await screen.findByText('API online')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
  });

  it('reports the API as unreachable when the request fails', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    render(<App />);

    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
  });

  it('treats a response that breaks the contract as unreachable', async () => {
    stubFetch(async () => Response.json({ status: 'maybe' }));

    render(<App />);

    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
  });
});
