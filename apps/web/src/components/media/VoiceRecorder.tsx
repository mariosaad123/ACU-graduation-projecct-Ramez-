import { ArrowCounterClockwiseIcon, MicrophoneIcon, StopIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../lib/format-duration';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { AudioPlayer } from './AudioPlayer';
import { useVoiceRecorder } from './use-voice-recorder';
import styles from './VoiceRecorder.module.css';

const LEVEL_BARS = 12;

interface VoiceRecorderProps {
  maxDurationSeconds?: number;
  onRecorded?: (recording: Blob) => void;
  onReset?: () => void;
  className?: string;
}

export function VoiceRecorder({
  maxDurationSeconds = 60,
  onRecorded,
  onReset,
  className,
}: VoiceRecorderProps) {
  const { t } = useTranslation();
  const { state, elapsedMs, level, start, stop, reset } = useVoiceRecorder({
    maxDurationMs: maxDurationSeconds * 1000,
    onRecorded,
  });

  const elapsed = formatDuration(elapsedMs / 1000);
  const limit = formatDuration(maxDurationSeconds);
  const activeBars = Math.round(level * LEVEL_BARS);

  function retake() {
    reset();
    onReset?.();
  }

  return (
    <div className={clsx(styles.recorder, className)} data-status={state.status}>
      {state.status === 'recorded' ? (
        <div className={styles.result}>
          <AudioPlayer src={state.url} title={t('recorder.recorded')} showSpeedControl={false} />
          <Button
            variant="secondary"
            size="sm"
            iconStart={<ArrowCounterClockwiseIcon />}
            onClick={retake}
          >
            {t('recorder.retake')}
          </Button>
        </div>
      ) : (
        <div className={styles.panel}>
          {state.status === 'recording' ? (
            <button
              type="button"
              className={clsx(styles.control, styles.stop)}
              onClick={stop}
              aria-label={t('recorder.stop')}
            >
              <StopIcon weight="fill" />
            </button>
          ) : (
            <button
              type="button"
              className={styles.control}
              onClick={() => {
                void start();
              }}
              disabled={state.status === 'requesting'}
              aria-label={t('recorder.start')}
            >
              {state.status === 'requesting' ? (
                <Spinner tone="current" size="1.5rem" label={false} />
              ) : (
                <MicrophoneIcon weight="fill" />
              )}
            </button>
          )}

          <div className={styles.details}>
            <p className={styles.status} aria-live="polite">
              {state.status === 'recording' && t('recorder.recording')}
              {state.status === 'requesting' && t('recorder.requesting')}
              {(state.status === 'idle' || state.status === 'error') && t('recorder.start')}
            </p>

            {state.status === 'recording' ? (
              <div className={styles.live}>
                <span className={styles.time} dir="ltr">
                  {elapsed} / {limit}
                </span>
                <span
                  className={styles.meter}
                  role="meter"
                  aria-label={t('recorder.level')}
                  aria-valuemin={0}
                  aria-valuemax={LEVEL_BARS}
                  aria-valuenow={activeBars}
                >
                  {Array.from({ length: LEVEL_BARS }, (_, index) => (
                    <span key={index} className={styles.bar} data-active={index < activeBars} />
                  ))}
                </span>
              </div>
            ) : (
              <p className={styles.hint}>{t('recorder.limit', { seconds: maxDurationSeconds })}</p>
            )}
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <Alert tone="danger" live>
          {t(`recorder.errors.${state.error}`)}
        </Alert>
      )}
    </div>
  );
}
