import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Modules déterministes (les modules d'E/S — runner, sandbox, runtime — sont couverts par les tests d'intégration).
      include: ['src/gates/evaluate.ts', 'src/gates/loop-policy.ts', 'src/gates/parsers.ts', 'src/lib/models.ts', 'src/lib/target-guard.ts'],
    },
  },
});
