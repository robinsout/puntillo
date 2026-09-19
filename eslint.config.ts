import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

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
                'vue',
                'vue/*',
                'vue-router',
                'pinia',
                'vue-i18n',
                'vexflow',
                '@vue/*',
                '@/application/*',
                '@/infrastructure/*',
                '@/presentation/*',
                '../application/*',
                '../infrastructure/*',
                '../presentation/*',
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
                'vexflow',
                '@/infrastructure/*',
                '@/presentation/*',
                '../infrastructure/*',
                '../presentation/*',
              ],
              message:
                'Слой приложения зависит только от домена. Инфраструктура инжектируется через интерфейсы (ТЗ 13).',
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
              group: [
                '@/application/*',
                '@/presentation/*',
                '../application/*',
                '../presentation/*',
              ],
              message: 'Инфраструктура зависит только от домена (ТЗ 13).',
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
