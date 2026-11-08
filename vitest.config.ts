import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Logic is covered by unit tests; screens and components are covered by the e2e suite.
      include: ['src/lib/**', 'src/engines/**', 'src/sync/**', 'src/store.ts', 'src/i18n.ts', 'api/**'],
      // Thin wrappers over browser-only APIs (speech, Chrome's Prompt API, document.title): exercised end to end.
      exclude: [
        '**/*.test.ts',
        'src/engines/voice.ts',
        'src/engines/speechInput.ts',
        'src/engines/localAgent.ts',
        'src/lib/title.ts',
      ],
      // CI fails below these. Raise them as coverage grows; don't lower them to make a PR pass.
      thresholds: { statements: 85, branches: 75, functions: 80, lines: 85 },
    },
  },
});
