import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { describeApiError } from '../../features/auth/api-errors';
import { Alert } from './Alert';
import { Button } from './Button';
import styles from './LoadError.module.css';

interface LoadErrorProps {
  error: unknown;
  /** Asks for the same thing again. */
  onRetry: () => void;
  /** True while that second request is on its way. */
  retrying?: boolean;
}

/**
 * Something could not be loaded: says what went wrong in the reader's words and offers to try
 * again on the spot, so nobody has to reload the page and lose their place.
 */
export function LoadError({ error, onRetry, retrying = false }: LoadErrorProps) {
  const { t } = useTranslation();
  return (
    <Alert tone="danger" live>
      <span className={styles.row}>
        <span>{describeApiError(t, error)}</span>
        <Button
          size="sm"
          variant="secondary"
          loading={retrying}
          iconStart={<ArrowClockwiseIcon aria-hidden="true" />}
          onClick={onRetry}
        >
          {t('common.retry')}
        </Button>
      </span>
    </Alert>
  );
}
