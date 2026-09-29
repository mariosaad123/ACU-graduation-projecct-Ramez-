import clsx from 'clsx';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  inlineSize?: string;
  blockSize?: string;
  shape?: 'text' | 'block' | 'circle';
  className?: string;
}

/** Decorative placeholder. The region that is loading should carry `aria-busy="true"`. */
export function Skeleton({
  inlineSize = '100%',
  blockSize = '1em',
  shape = 'text',
  className,
}: SkeletonProps) {
  return (
    <span
      className={clsx(styles.skeleton, styles[shape], className)}
      style={{ inlineSize, blockSize }}
      aria-hidden="true"
    />
  );
}
