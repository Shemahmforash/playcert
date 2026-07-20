import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vitest owns the unit suite only. Playwright specs live in tests/e2e/*.spec.ts
  // (a distinct `.spec.ts` suffix) and are additionally excluded here so a stray
  // `pnpm test` never tries to run the browser e2e through jsdom.
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
