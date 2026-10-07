import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,vue}'],
        // Spec §16: the domain is fully covered by unit tests.
        thresholds: {
          'src/domain/**/*.ts': {
            statements: 100,
            branches: 100,
            functions: 100,
            lines: 100,
          },
        },
      },
    },
  }),
)
