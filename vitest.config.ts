import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    env: {
      JWT_SECRET: 'test-secret',
      AUTH_USERNAME: 'operator',
      AUTH_PASSWORD: 'changeme',
      KAFKA_ENABLED: 'false',
    },
  },
});
