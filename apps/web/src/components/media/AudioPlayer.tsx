import { PauseIcon, PlayIcon } from '@phosphor-icons/react';
import clsx from 'clsx';
import { useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../lib/format-duration';
import styles from './AudioPlayer.module.css';

const PLAYBACK_RATES = [0.75, 1, 1.25] as const;

interface AudioPlayerProps {
  src: string;
  title?: string;
  /** Language of the title, when it differs from the interface language. */
  titleLang?: string;
  /** Limits how many times the recording can be played from the start, as in listening tests. */
  maxPlays?: number;
  /** Seeking is off by default for limited recordings, so a limited play cannot be replayed in parts. */
  allowSeeking?: boolean;
  showSpeedControl?: boolean;
  className?: string;
}

export function AudioPlayer({
  src,
  title,
  titleLang,
  maxPlays,
  allowSeeking = maxPlays === undefined,
  showSpeedControl = true,
  className,
}: AudioPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const speedLabelId = useId();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<number>(1);
  const [playsUsed, setPlaysUsed] = useState(0);
  const [playInProgress, setPlayInProgress] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isLimited = maxPlays !== undefined;
  const playsLeft = isLimited ? Math.max(maxPlays - playsUsed, 0) : Number.POSITIVE_INFINITY;
  const canStartNewPlay = playsLeft > 0;
  const playDisabled = hasError || (!isPlaying && !playInProgress && !canStartNewPlay);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const timeText = `${formatDuration(currentTime)} / ${formatDuration(duration)}`;

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || playDisabled) {
      return;
    }
    if (isPlaying) {
      audio.pause();
      return;
    }
    audio.playbackRate = rate;
    audio.play().catch((error: unknown) => {
      // AbortError (interrupted by pause) and NotAllowedError (autoplay policy) are not load
      // failures; real load failures also fire the element's error event.
      if (error instanceof DOMException && error.name === 'NotSupportedError') {
        setHasError(true);
      }
    });
  }

  function changeRate(nextRate: number) {
    setRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  }

  return (
    <div className={clsx(styles.player, className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          setHasError(false);
        }}
        onDurationChange={(event) => {
          setDuration(event.currentTarget.duration);
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
        }}
        onPlay={() => {
          setIsPlaying(true);
          if (!playInProgress) {
            setPlayInProgress(true);
            setPlaysUsed((count) => count + 1);
          }
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onEnded={(event) => {
          setIsPlaying(false);
          setPlayInProgress(false);
          event.currentTarget.currentTime = 0;
          setCurrentTime(0);
        }}
        onError={() => {
          setHasError(true);
          setIsPlaying(false);
        }}
      />

      <button
        type="button"
        className={styles.playButton}
        onClick={togglePlayback}
        disabled={playDisabled}
        aria-label={isPlaying ? t('audio.pause') : t('audio.play')}
      >
        {isPlaying ? <PauseIcon weight="fill" /> : <PlayIcon weight="fill" />}
      </button>

      <div className={styles.main}>
        {title && (
          <p className={styles.title} lang={titleLang}>
            {title}
          </p>
        )}

        <div className={styles.timeline}>
          {allowSeeking ? (
            <input
              type="range"
              className={styles.seek}
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              disabled={hasError || duration === 0}
              aria-label={t('audio.seek')}
              aria-valuetext={timeText}
              style={{ '--progress': `${progress}%` } as CSSProperties}
              onChange={(event) => {
                const audio = audioRef.current;
                if (audio) {
                  audio.currentTime = Number(event.target.value);
                }
              }}
            />
          ) : (
            <div className={styles.track} aria-hidden="true">
              <div className={styles.trackFill} style={{ inlineSize: `${progress}%` }} />
            </div>
          )}
          <span className={styles.time} dir="ltr" aria-hidden={allowSeeking}>
            {timeText}
          </span>
        </div>

        <div className={styles.meta}>
          {hasError ? (
            <span className={styles.error} role="alert">
              {t('audio.loadError')}
            </span>
          ) : (
            isLimited && (
              <span className={styles.plays} aria-live="polite">
                {canStartNewPlay || playInProgress
                  ? t('audio.playsLeft', { count: playsLeft })
                  : t('audio.noPlaysLeft')}
              </span>
            )
          )}

          {showSpeedControl && (
            <div className={styles.speed} role="group" aria-labelledby={speedLabelId}>
              <span id={speedLabelId} className="visually-hidden">
                {t('audio.speed')}
              </span>
              {PLAYBACK_RATES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.speedOption}
                  aria-pressed={rate === option}
                  onClick={() => {
                    changeRate(option);
                  }}
                  dir="ltr"
                >
                  {option}×
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
