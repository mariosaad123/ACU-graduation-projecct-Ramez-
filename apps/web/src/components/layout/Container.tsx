import clsx from 'clsx';
import type { ComponentPropsWithRef } from 'react';
import styles from './Container.module.css';

export function Container({ className, ...rest }: ComponentPropsWithRef<'div'>) {
  return <div className={clsx(styles.container, className)} {...rest} />;
}
