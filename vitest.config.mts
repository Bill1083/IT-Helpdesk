import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // The PDF template is TSX. tsconfig says "preserve" (Next compiles JSX
  // itself), so tell Vite's Oxc transform to use React's automatic runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { environment: 'node' },
});
