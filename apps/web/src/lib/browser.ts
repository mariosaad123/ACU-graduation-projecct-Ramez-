/**
 * A full page load to `path`. Used after signing out so nothing cached for the account survives
 * in memory; kept in its own module so tests can replace it.
 */
export function reloadTo(path: string): void {
  window.location.replace(path);
}
