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

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div className="menu-anchor" ref={container}>
      <button className="ghost" aria-expanded={open} aria-haspopup="dialog" onClick={onToggle}>
        {label} <ChevronIcon />
      </button>
      {open && (
        <div className="menu" role="dialog" aria-label={title}>
          {children}
        </div>
      )}
      {open && aside}
    </div>
  );
}
