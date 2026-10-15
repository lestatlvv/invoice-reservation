import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    env: {
      JWT_SECRET: 'test-secret',
      AUTH_USERNAME: 'operator',
      AUTH_PASSWORD: 'changeme',
      KAFKA_ENABLED: 'false',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://finance:finance@localhost:5433/finance',
    },
  },
});
