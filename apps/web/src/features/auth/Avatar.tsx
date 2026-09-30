import type { SessionUser } from '@acu/shared';
import { useState, type CSSProperties } from 'react';
import styles from './Avatar.module.css';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]];
  return letters
    .map((part) => part?.charAt(0) ?? '')
    .join('')
    .toUpperCase();
}

/** The Google profile picture, or the person's initials when there is none or it fails to load. */
export function Avatar({
  user,
  size,
}: {
  user: Pick<SessionUser, 'name' | 'avatarUrl'>;
  size: string;
}) {
  // Remembered per address, so a new photo gets its chance after an old one failed to load.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const style = { '--avatar-size': size } as CSSProperties;

  if (user.avatarUrl && user.avatarUrl !== failedUrl) {
    return (
      <img
        className={styles.avatar}
        style={style}
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => {
          setFailedUrl(user.avatarUrl);
        }}
      />
    );
  }

  return (
    <span className={`${styles.avatar} ${styles.initials}`} style={style} aria-hidden="true">
      {initialsOf(user.name)}
    </span>
  );
}
