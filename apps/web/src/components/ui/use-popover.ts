import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

/**
 * State for a button that shows a floating panel: a press outside or Escape closes it, and
 * Escape returns focus to the button so keyboard users do not lose their place.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setOpen((value) => !value);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    },
    [open],
  );

  return { open, close, toggle, panelId, containerRef, buttonRef, onKeyDown };
}
