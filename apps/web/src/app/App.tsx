import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { i18n as I18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from '../components/ui/toast/ToastProvider';
import { SESSION_QUERY_KEY, markSessionEnded } from '../features/auth/session';
import { watchForSignOut } from '../lib/api';
import { routes } from './routes';

const router = createBrowserRouter(routes);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: true, retry: 1 },
  },
});

// Once the API refuses the session, the account on screen is no longer signed in: clearing it
// sends every protected page to sign-in, with a word about why.
watchForSignOut(() => {
  if (queryClient.getQueryData(SESSION_QUERY_KEY)) {
    markSessionEnded();
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
  }
});

export function App({ i18n }: { i18n: I18n }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
