import { Outlet, ScrollRestoration, type Location } from 'react-router';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { MAIN_CONTENT_ID, SkipLink } from './SkipLink';
import styles from './AppLayout.module.css';

/**
 * Every first load shares one history key, so a position saved on one page would be restored on
 * whichever page the tab loads next. Tying that key to the address keeps a reload in place and
 * starts any other page at its top.
 */
function scrollKey(location: Location): string {
  return location.key === 'default'
    ? `default:${location.pathname}${location.search}`
    : location.key;
}

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <SkipLink />
      <SiteHeader />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration getKey={scrollKey} />
    </div>
  );
}
