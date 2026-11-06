import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronIcon } from './icons';

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  /** One line of context shown under the label, e.g. what a level means. */
  hint?: string;
}

/** A word inside a sentence that opens a small listbox of choices. Keyboard: arrows, Enter, Esc. */
export function InlinePicker<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly PickerOption<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [alignRight, setAlignRight] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[selectedIndex];

  function show() {
    // Open toward whichever side has room, so the menu never runs off a narrow screen.
    const rect = trigger.current?.getBoundingClientRect();
    setAlignRight(!!rect && rect.left + 280 > window.innerWidth);
    setActive(selectedIndex);
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function choose(index: number) {
    onChange(options[index].value);
    close();
  }

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  function onTriggerKey(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      show();
    }
  }

  function onListKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') setActive((i) => (i + 1) % options.length);
    else if (e.key === 'ArrowUp') setActive((i) => (i - 1 + options.length) % options.length);
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') return close(false);
    else return;
    e.preventDefault();
  }

  return (
    <span className="picker" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={onTriggerKey}
      >
        {current.label}
        <ChevronIcon />
      </button>
      {open && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          tabIndex={-1}
          className={alignRight ? 'picker-menu right' : 'picker-menu'}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={i === active ? 'active' : ''}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span className="picker-text">
                <span className="picker-label">{o.label}</span>
                {o.hint && <span className="picker-hint">{o.hint}</span>}
              </span>
              {o.value === value && (
                <svg className="picker-check" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
