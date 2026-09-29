import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Single-sourced contracts live in the server's vendored shared (the MCP
      // borrows them; see tsconfig paths). CI needs no server/node_modules
      // because zod also resolves to this package's own copy.
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
      zod: path.resolve(__dirname, 'node_modules/zod'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
