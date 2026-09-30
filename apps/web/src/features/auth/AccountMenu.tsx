import type { SessionUser } from '@acu/shared';
import {
  CaretDownIcon,
  SignOutIcon,
  SquaresFourIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '../../components/ui/Badge';
import { usePopover } from '../../components/ui/use-popover';
import { Avatar } from './Avatar';
import { landingPathFor, useSignOut } from './session';
import styles from './AccountMenu.module.css';

export function AccountMenu({ user, className }: { user: SessionUser; className?: string }) {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const { open, close, toggle, panelId, containerRef, buttonRef, onKeyDown } = usePopover();
  const setupPending = !user.role;

  return (
    <div ref={containerRef} className={clsx(styles.menu, className)} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${t('account.menu')}: ${user.name}`}
        onClick={toggle}
      >
        <Avatar user={user} size="2.25rem" />
        {setupPending && <span className={styles.dot} aria-hidden="true" />}
        <CaretDownIcon className={styles.caret} aria-hidden="true" />
      </button>

      <div id={panelId} className={styles.panel} hidden={!open}>
        <div className={styles.identity}>
          <Avatar user={user} size="2.75rem" />
          <div className={styles.identityText}>
            <p className={styles.name}>{user.name}</p>
            <p className={styles.email}>
              <span dir="ltr">{user.email}</span>
            </p>
          </div>
        </div>

        {user.role ? (
          <Badge tone="info">{t(`account.roles.${user.role}`)}</Badge>
        ) : (
          <p className={styles.pending}>
            <WarningCircleIcon weight="fill" aria-hidden="true" />
            {user.doctor ? t('account.pendingEmail') : t('account.completeSetup')}
          </p>
        )}

        <ul className={styles.items}>
          <li>
            <Link to={landingPathFor(user)} className={styles.item} onClick={close}>
              <SquaresFourIcon aria-hidden="true" />
              {setupPending ? t('account.completeSetup') : t('account.dashboard')}
            </Link>
          </li>
          <li>
            <button
              type="button"
              className={styles.item}
              disabled={signOut.isPending}
              onClick={() => {
                signOut.mutate(undefined, { onSuccess: close });
              }}
            >
              <SignOutIcon className="mirror-in-rtl" aria-hidden="true" />
              {t('account.signOut')}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
