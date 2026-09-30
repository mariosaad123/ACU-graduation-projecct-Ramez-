import type { LearningLanguage } from '@acu/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { LanguageGlyph } from '../../components/language/LanguageGlyph';
import styles from './GroupPhoto.module.css';

interface GroupPhotoProps {
  photoUrl: string | null;
  language: LearningLanguage;
  size?: 'sm' | 'md' | 'lg';
  /** Shows the language in the emblem orange when there is no photo. */
  active?: boolean;
  className?: string;
}

/** The group's photo, or its language's letter when there is none. Decorative: named nearby. */
export function GroupPhoto({
  photoUrl,
  language,
  size = 'md',
  active = false,
  className,
}: GroupPhotoProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!photoUrl || photoUrl === failedUrl) {
    return <LanguageGlyph language={language} size={size} active={active} className={className} />;
  }
  return (
    <img
      className={clsx(styles.photo, styles[size], className)}
      src={photoUrl}
      alt=""
      onError={() => {
        setFailedUrl(photoUrl);
      }}
    />
  );
}
