'use client';

import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/client';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

const ROW_HEIGHT = 36;
const MAX_MENU_HEIGHT = 288;

/**
 * A themed replacement for <select>. Native selects are drawn by the OS, which
 * paints a white list with the app's light text in dark mode; this one matches
 * the rest of the UI. The trigger's look is supplied by the caller.
 */
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  renderTrigger,
  className,
  wrapperClassName,
  align = 'left',
}: {
  /** Accessible name for the trigger and the list. */
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  renderTrigger: (selected: DropdownOption<T> | undefined) => React.ReactNode;
  /** Classes for the trigger button. */
  className?: string;
  /** Classes for the positioning wrapper (e.g. w-full in the sidebar). */
  wrapperClassName?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const selectedIndex = options.findIndex((o) => o.value === value);

  function show() {
    const rect = button.current?.getBoundingClientRect();
    if (rect) {
      // Flip upward when the list would run off the bottom of the window.
      const height = Math.min(options.length * ROW_HEIGHT + 8, MAX_MENU_HEIGHT);
      const below = window.innerHeight - rect.bottom;
      setUp(below < height + 8 && rect.top > below);
    }
    setActive(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function close(refocus = false) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function pick(index: number) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    close(true);
  }

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function onListKey(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        pick(active);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close();
        break;
    }
  }

  return (
    <div ref={wrapper} className={cn('relative', wrapperClassName)}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={label}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            show();
          }
        }}
        className={className}
      >
        {renderTrigger(options[selectedIndex])}
      </button>
      {open && (
        <ul
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          tabIndex={-1}
          onKeyDown={onListKey}
          className={cn(
            'scroll-thin absolute z-50 max-h-72 w-max min-w-full max-w-xs overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 text-sm text-zinc-800 shadow-lg outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
            up ? 'bottom-full mb-1' : 'top-full mt-1',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-${index}`}
              data-index={index}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(index)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5',
                index === active && 'bg-zinc-100 dark:bg-zinc-800',
              )}
            >
              {option.icon && <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{option.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <Check className={cn('size-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
