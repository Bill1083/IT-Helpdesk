'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

/** Small confirmations ("Copied for Slack", "Saved"), following the app theme. */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      closeButton
      toastOptions={{ className: 'font-sans' }}
    />
  );
}
