import type { ReactNode } from 'react';
import styles from './DesignSystemPage.module.css';

interface DsSectionProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}

export function DsSection({ id, title, description, children }: DsSectionProps) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <header className={styles.sectionHeader}>
        <h2 id={`${id}-title`} className={styles.sectionTitle}>
          {title}
        </h2>
        {description && <p className={styles.sectionDescription}>{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function DsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>{title}</h3>
      {children}
    </div>
  );
}
