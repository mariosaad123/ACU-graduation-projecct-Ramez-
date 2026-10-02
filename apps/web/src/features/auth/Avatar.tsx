import type { SessionUser } from '@acu/shared';
import { useState, type CSSProperties } from 'react';
import styles from './Avatar.module.css';

/** Titles such as "Dr." or "د." are not part of anyone's initials. */
const TITLE = /^(dr|prof|د|أ\.?د|م)\.?$/i;

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const named = words.filter((word) => !TITLE.test(word));
  const parts = named.length > 0 ? named : words;
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
