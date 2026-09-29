import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '../components/ui/toast/ToastProvider';
import type { InterfaceLocale } from '../i18n/config';
import { initI18n } from '../i18n/i18n';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: InterfaceLocale;
  route?: string;
}

/** Renders with the same providers as the app: translations, toasts and a router. */
export function renderWithProviders(
  ui: ReactElement,
  { locale = 'en', route = '/', ...options }: ProviderOptions = {},
) {
  const i18n = initI18n(locale);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={i18n}>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </ToastProvider>
      </I18nextProvider>
    );
  }

  return { i18n, ...render(ui, { wrapper: Wrapper, ...options }) };
}
