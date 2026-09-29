import type { Skill } from '@acu/shared';
import clsx from 'clsx';
import type { ComponentPropsWithRef } from 'react';
import styles from './Card.module.css';

interface CardProps extends ComponentPropsWithRef<'div'> {
  /** Adds a coloured rule at the top, so a card can be recognised by its skill at a glance. */
  skill?: Skill;
  padding?: 'md' | 'lg';
}

export function Card({ skill, padding = 'md', className, ...rest }: CardProps) {
  return (
    <div className={clsx(styles.card, styles[padding], className)} data-skill={skill} {...rest} />
  );
}
