import type { i18n as I18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from '../components/ui/toast/ToastProvider';
import { routes } from './routes';

const router = createBrowserRouter(routes);

export function App({ i18n }: { i18n: I18n }) {
  return (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </I18nextProvider>
  );
}
