import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { detectInitialLocale } from './i18n/config';
import { initI18n } from './i18n/i18n';
import { loadDeferredFonts } from './styles/load-deferred-fonts';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root is missing from index.html');
}

// Runs before the first render, so the page never flashes in the wrong direction.
const i18n = initI18n(detectInitialLocale());

createRoot(container).render(
  <StrictMode>
    <App i18n={i18n} />
  </StrictMode>,
);

loadDeferredFonts();
