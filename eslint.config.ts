import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

const vueEcosystem = ['vue', 'vue/*', 'vue-router', 'pinia', 'vue-i18n', '@vue/*']

// Импорт слоя по алиасу или относительному пути с любой глубины.
// Разрешённые модули слоя перечисляются в allowed. Шаблоны в синтаксисе gitignore:
// при исключениях запрещаются модули слоя, а не сам каталог, иначе отрицание не сработает.
const layer = (name: string, ...allowed: string[]) =>
  allowed.length === 0
    ? [`**/${name}`, `**/${name}/**`]
    : [`**/${name}/*`, ...allowed.map((module) => `!**/${name}/${module}`)]

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  // ТЗ 13: зависимости направлены только внутрь.
  // presentation → application → domain ← infrastructure
  // Исключения: infrastructure → application/ports, presentation → UI-адаптеры infrastructure.
  // Точка сборки src/main.ts под правила слоёв не попадает.
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
        {
          patterns: [
            {
              group: [...layer('application', 'ports'), ...layer('presentation')],
              message:
                'Инфраструктура зависит от домена и из слоя приложения импортирует только порты (ТЗ 13).',
            },
          ],
        },
      ],
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
