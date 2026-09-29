/** Loads the Chinese and Japanese font rules once the browser is idle after the first render. */
export function loadDeferredFonts(): void {
  const load = () => {
    void import('./fonts-cjk.css');
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(load, { timeout: 3000 });
  } else {
    setTimeout(load, 1500);
  }
}
