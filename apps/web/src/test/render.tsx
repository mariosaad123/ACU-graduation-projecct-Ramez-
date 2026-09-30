import type { SessionUser } from '@acu/shared';
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ToastProvider } from '../components/ui/toast/ToastProvider';
import { SESSION_QUERY_KEY } from '../features/auth/session';
import type { InterfaceLocale } from '../i18n/config';
import { initI18n } from '../i18n/i18n';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: InterfaceLocale;
  route?: string;
  /** The route pattern, when the page reads parameters from it, e.g. "/join/:code". */
  path?: string;
  /** The signed-in account; null for a visitor. Leave undefined to let the app ask the API. */
  session?: SessionUser | null;
  /** Other paths to render, so redirects can be observed. */
  extraRoutes?: Record<string, ReactNode>;
  /** Server data already loaded, e.g. [STUDENT_GROUPS_KEY, []]; it is not fetched again. */
  cache?: readonly (readonly [QueryKey, unknown])[];
}

/** Renders with the same providers as the app: translations, server state, toasts and a router. */
export function renderWithProviders(
  ui: ReactElement,
  {
    locale = 'en',
    route = '/',
    path: pattern,
    session,
    extraRoutes = {},
    cache = [],
    ...options
  }: ProviderOptions = {},
) {
  const i18n = initI18n(locale);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  for (const [key, data] of cache) {
    queryClient.setQueryData(key, data);
  }
  if (session !== undefined) {
    queryClient.setQueryData(SESSION_QUERY_KEY, session);
  }
  const path = pattern ?? route.split(/[?#]/)[0] ?? '/';

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <MemoryRouter initialEntries={[route]}>
              <Routes>
                <Route path={path} element={children} />
                {Object.entries(extraRoutes).map(([extraPath, element]) => (
                  <Route key={extraPath} path={extraPath} element={element} />
                ))}
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>
      </I18nextProvider>
    );
  }

  return { i18n, queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Salma Hassan',
    email: 'salma@gmail.com',
    avatarUrl: null,
    role: null,
    student: null,
    doctor: null,
    ...overrides,
  };
}

/** Answers `fetch` calls in order; each entry is a status and a JSON body. */
export function queueResponses(...responses: [status: number, body?: unknown][]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const queue = [...responses];
  const fetchMock = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const [status, body] = queue.shift() ?? [500, {}];
    return Promise.resolve(
      status === 204 ? new Response(null, { status }) : Response.json(body ?? {}, { status }),
    );
  };
  return { fetchMock, calls };
}

/** The item at `index`, failing the test with a clear message when it is missing. */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected an item at index ${index}, found ${items.length} items`);
  }
  return item;
}

export function apiError(code: string, extras: { details?: object; fields?: object } = {}) {
  return { error: { code, message: code, requestId: 'test', ...extras } };
}
