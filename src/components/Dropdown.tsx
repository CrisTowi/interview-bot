import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronIcon } from './icons';

/** A top-bar button that opens a panel; closes on outside click or Escape. */
export function Dropdown({
  label,
  title,
  open,
  onToggle,
  onClose,
  children,
  aside,
}: {
  label: ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
  /** Optional floating panel beside the menu; part of the dropdown for outside-click purposes. */
  aside?: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Move focus into the panel so keyboard and screen-reader users start inside it.
    panel.current?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onClose();
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div className="menu-anchor" ref={container}>
      <button ref={trigger} className="ghost" aria-expanded={open} aria-haspopup="dialog" onClick={onToggle}>
        {label} <ChevronIcon />
      </button>
      {open && (
        <div ref={panel} className="menu" role="dialog" aria-label={title} tabIndex={-1}>
          {children}
        </div>
      )}
      {open && aside}
    </div>
  );
}
