import { ListIcon, SignInIcon, XIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { AccountMenu } from '../../features/auth/AccountMenu';
import { useSession } from '../../features/auth/session';
import {
  ActiveLanguageSwitch,
  LanguageSwitchList,
} from '../../features/languages/ActiveLanguageSwitch';
import { BrandLockup } from '../brand/BrandLockup';
import { ButtonLink } from '../ui/ButtonLink';
import { IconButton } from '../ui/IconButton';
import { Container } from './Container';
import { LocaleSwitch } from './LocaleSwitch';
import { PRIMARY_NAV } from './nav-items';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  const { t } = useTranslation();
  const session = useSession();
  const user = session.data ?? null;
  const student = user?.role === 'student' ? user.student : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const navLinks = (onNavigate?: () => void) =>
    PRIMARY_NAV.map((item) => (
      <li key={item.to}>
        <NavLink
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) => clsx(styles.link, isActive && styles.active)}
        >
          {t(item.labelKey)}
        </NavLink>
      </li>
    ));

  return (
    <header
      className={styles.header}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && menuOpen) {
          closeMenu();
          toggleRef.current?.focus();
        }
      }}
    >
      <Container className={styles.bar}>
        <BrandLockup />

        <nav className={styles.desktopNav} aria-label={t('nav.label')}>
          <ul className={styles.list}>{navLinks()}</ul>
        </nav>

        <div className={styles.actions}>
          <LocaleSwitch className={styles.wideOnly} />
          {session.isPending ? (
            <span className={styles.accountPlaceholder} aria-hidden="true" />
          ) : user ? (
            <>
              {student && <ActiveLanguageSwitch student={student} className={styles.wideOnly} />}
              <AccountMenu user={user} />
            </>
          ) : (
            <ButtonLink
              to="/sign-in"
              size="sm"
              className={styles.wideOnly}
              iconStart={<SignInIcon className="mirror-in-rtl" aria-hidden="true" />}
            >
              {t('nav.signIn')}
            </ButtonLink>
          )}
          <IconButton
            ref={toggleRef}
            className={styles.menuToggle}
            label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            icon={menuOpen ? <XIcon /> : <ListIcon />}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
          />
        </div>
      </Container>

      <div id={menuId} className={styles.mobilePanel} hidden={!menuOpen}>
        <Container>
          <nav aria-label={t('nav.label')}>
            <ul className={styles.mobileList}>{navLinks(closeMenu)}</ul>
          </nav>
          {student && (
            <div className={styles.mobileLanguages}>
              <LanguageSwitchList student={student} onNavigate={closeMenu} />
            </div>
          )}
          <div className={styles.mobileActions}>
            {!user && !session.isPending && (
              <ButtonLink to="/sign-in" fullWidth onClick={closeMenu}>
                {t('nav.signIn')}
              </ButtonLink>
            )}
            <LocaleSwitch />
          </div>
        </Container>
      </div>
    </header>
  );
}
