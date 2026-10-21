'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Grows a textarea with its text up to `max` pixels. Re-measures after the
 * first paint, when web fonts finish loading, and on resize: measuring too
 * early (narrow width, fallback font) makes Chrome count the wrapped
 * placeholder and open the box at full height.
 */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string, max: number) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
      // Only show a scrollbar once the text outgrows the cap.
      el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
    };
    fit();
    const frame = requestAnimationFrame(fit);
    void document.fonts?.ready.then(fit);
    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth !== width) {
        width = el.offsetWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref, value, max]);
}
