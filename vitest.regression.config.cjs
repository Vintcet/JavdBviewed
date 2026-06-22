const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  cacheDir: '.vitest-cache/regression',
  test: {
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    environment: 'node',
    include: ['tests/regression/**/*.test.ts'],
  },
});
