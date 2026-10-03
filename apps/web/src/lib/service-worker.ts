/**
 * Registers the service worker once the page has loaded. Production only: in development it would
 * sit between the browser and the dev server's live reload.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }
  window.addEventListener('load', () => {
    // Without it the platform still works; only the offline page and push are lost.
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}
