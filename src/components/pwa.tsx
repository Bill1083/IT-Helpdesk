'use client';

import { useEffect, useSyncExternalStore } from 'react';

/** Chromium's install prompt event (not in the standard DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The prompt event fires once, early, on whatever page loads first, so it is
// kept here for the Settings page to use later.
let deferred: BeforeInstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string {
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  return `${deferred ? 1 : 0}${justInstalled || standalone ? 1 : 0}`;
}

/** Registers the service worker and listens for the install prompt. Render once. */
export function PwaSetup() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferred = event as BeforeInstallPromptEvent;
      emit();
    };
    const onInstalled = () => {
      justInstalled = true;
      deferred = null;
      emit();
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return null;
}

export function useInstallPrompt() {
  const state = useSyncExternalStore(subscribe, snapshot, () => '00');
  return {
    canInstall: state[0] === '1',
    installed: state[1] === '1',
    async install() {
      if (!deferred) return;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') justInstalled = true;
      deferred = null;
      emit();
    },
  };
}
