import { ArrowLeftIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import styles from './Onboarding.module.css';

interface SetupHeaderProps {
  step: 1 | 2 | 3;
  total: 2 | 3;
  title: string;
  lead: string;
  backTo?: string;
}

export function SetupHeader({ step, total, title, lead, backTo }: SetupHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      {backTo && (
        <Link to={backTo} className={styles.back}>
          <ArrowLeftIcon className={clsx(styles.backIcon, 'mirror-in-rtl')} aria-hidden="true" />
          {t('welcome.back')}
        </Link>
      )}
      <div className={styles.steps}>
        <span className={styles.stepText}>{t('welcome.step', { current: step, total })}</span>
        <span className={styles.stepBars} aria-hidden="true">
          {Array.from({ length: total }, (_, index) => (
            <span key={index} data-done={index < step} />
          ))}
        </span>
      </div>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lead}>{lead}</p>
    </header>
  );
}
