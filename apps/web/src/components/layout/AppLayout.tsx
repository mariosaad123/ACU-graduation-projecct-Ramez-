import { useEffect, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigation, type Location } from 'react-router';
import { ConnectionBanner } from './ConnectionBanner';
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
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // A new page starts at its content for keyboard and screen reader users, as a full page load
  // would. Tabs and filters change the query only and leave the focus where it is.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <SkipLink />
      <SiteHeader />
      {/* A page's code is fetched on its first visit: the line says the click was heard. */}
      {navigation.state === 'loading' && <div className={styles.progress} role="presentation" />}
      <ConnectionBanner />
      <main ref={main} id={MAIN_CONTENT_ID} tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration getKey={scrollKey} />
    </div>
  );
}
