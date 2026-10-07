import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

const vueEcosystem = ['vue', 'vue/*', 'vue-router', 'pinia', 'vue-i18n', '@vue/*']

// Patterns use gitignore syntax: with exceptions, ban the layer's modules rather than
// the directory itself, otherwise the negation has no effect.
const layer = (name: string, ...allowed: string[]) =>
  allowed.length === 0
    ? [`**/${name}`, `**/${name}/**`]
    : [`**/${name}/*`, ...allowed.map((module) => `!**/${name}/${module}`)]

const infrastructureLayer = {
  group: [...layer('application', 'ports'), ...layer('presentation')],
  message:
    'Инфраструктура зависит от домена и из слоя приложения импортирует только порты (ТЗ 13).',
}

const vexflowOutsideNotation = {
  group: ['vexflow'],
  message: 'VexFlow вызывается только в адаптере нотоносца src/infrastructure/notation (ТЗ 13).',
}

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  // Spec §13: presentation → application → domain ← infrastructure.
  // src/main.ts is the composition root and is deliberately exempt.
  {
    name: 'app/layer-domain',
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...vueEcosystem,
                'vexflow',
                ...layer('application'),
                ...layer('infrastructure'),
                ...layer('presentation'),
              ],
              message:
                'Домен не импортирует Vue, браузерные API, сторонние библиотеки и внешние слои (ТЗ 13).',
            },
          ],
        },
      ],
    },
  },

  {
    name: 'app/layer-application',
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...vueEcosystem,
                'vexflow',
                ...layer('infrastructure'),
                ...layer('presentation'),
              ],
              message:
                'Слой приложения — чистый TypeScript и зависит только от домена. Инфраструктура инжектируется через порты (ТЗ 13).',
            },
          ],
        },
      ],
    },
  },

  {
    name: 'app/layer-infrastructure',
    files: ['src/infrastructure/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [infrastructureLayer, vexflowOutsideNotation] },
      ],
    },
  },

  // This block overrides the previous one entirely, so the layer boundaries are repeated.
  {
    name: 'app/layer-infrastructure-notation',
    files: ['src/infrastructure/notation/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [infrastructureLayer] }],
    },
  },

  {
    name: 'app/layer-presentation',
    files: ['src/presentation/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vexflow', ...layer('infrastructure', 'notation', 'i18n')],
              message:
                'Presentation импортирует из инфраструктуры только UI-адаптеры notation и i18n. Остальное приходит через порты из точки сборки (ТЗ 13).',
            },
          ],
        },
      ],
    },
  },

  // no-restricted-imports does not see dynamic import(), which is how the adapter loads VexFlow.
  {
    name: 'app/vexflow-dynamic-import',
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/infrastructure/notation/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/^vexflow(\\/|$)/]',
          message: vexflowOutsideNotation.message,
        },
      ],
    },
  },

  {
    ...pluginPlaywright.configs['flat/recommended'],
    files: ['e2e/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/**/*', 'src/**/*.spec.ts', 'src/**/*.test.ts'],
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  skipFormatting,
)
