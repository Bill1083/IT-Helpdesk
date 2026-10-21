import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // One accent, defined once in globals.css for light and dark.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
        },
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 6px 20px -8px rgb(0 0 0 / 0.10)',
        lift: '0 2px 4px rgb(0 0 0 / 0.04), 0 16px 40px -12px rgb(0 0 0 / 0.22)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(0.97) translateY(-2px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '0%': { backgroundPosition: '-480px 0' }, '100%': { backgroundPosition: '480px 0' } },
        'soft-pulse': { '0%, 100%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.35)' }, '50%': { boxShadow: '0 0 0 6px rgb(var(--accent) / 0)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.28s ease-out both',
        'pop-in': 'pop-in 0.14s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
        'soft-pulse': 'soft-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [typography],
} satisfies Config;
