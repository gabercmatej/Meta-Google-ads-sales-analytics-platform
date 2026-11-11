import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const coreSrc = fileURLToPath(new URL('../../packages/analytics-core/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@sedem-ads/analytics-core': coreSrc } },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    testTimeout: 30000,
  },
});
