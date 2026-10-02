import clsx from 'clsx';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  tabs: readonly TabItem[];
  defaultTabId?: string;
  /** Makes the choice controlled, e.g. kept in the address so a reload returns to it. */
  selectedTabId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

export function Tabs({ label, tabs, defaultTabId, selectedTabId, onSelect, className }: TabsProps) {
  const baseId = useId();
  const [ownSelectedId, setOwnSelectedId] = useState(defaultTabId ?? tabs[0]?.id);
  const selectedId = selectedTabId ?? ownSelectedId;
  const setSelectedId = (id: string) => {
    setOwnSelectedId(id);
    onSelect?.(id);
  };
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const selectedIndex = Math.max(
    tabs.findIndex((tab) => tab.id === selectedId),
    0,
  );
  const selected = tabs[selectedIndex];

  function activate(index: number) {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) {
      return;
    }
    setSelectedId(tab.id);
    tabRefs.current.get(tab.id)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const isRtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = isRtl ? 'ArrowRight' : 'ArrowLeft';

    const targets: Record<string, number> = {
      [forward]: selectedIndex + 1,
      [backward]: selectedIndex - 1,
      Home: 0,
      End: tabs.length - 1,
    };

    const target = targets[event.key];
    if (target !== undefined) {
      event.preventDefault();
      activate(target);
    }
  }

  return (
    <div className={clsx(styles.tabs, className)}>
      <div role="tablist" aria-label={label} className={styles.list} onKeyDown={handleKeyDown}>
        {tabs.map((tab) => {
          const isSelected = tab.id === selected?.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) {
                  tabRefs.current.set(tab.id, node);
                } else {
                  tabRefs.current.delete(tab.id);
                }
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              className={styles.tab}
              onClick={() => {
                setSelectedId(tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {selected && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${selected.id}`}
          aria-labelledby={`${baseId}-tab-${selected.id}`}
          tabIndex={0}
          className={styles.panel}
        >
          {selected.content}
        </div>
      )}
    </div>
  );
}
