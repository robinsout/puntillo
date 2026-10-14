<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Locale } from '@/domain/language'
import { UiSelect } from '@/presentation/ui'
import { usePreferencesStore } from './preferences-store'

const preferences = usePreferencesStore()

// Each language is named in itself, so the names are not translated.
const LANGUAGES: readonly { value: Locale; label: string; lang: Locale }[] = [
  { value: 'en', label: 'English', lang: 'en' },
  { value: 'ru', label: 'Русский', lang: 'ru' },
  { value: 'es', label: 'Español', lang: 'es' },
]

const { t, locale } = useI18n()

const language = computed({
  get: () => locale.value as Locale,
  set(chosen: Locale) {
    preferences.chooseLanguage(chosen)
    locale.value = chosen
    document.documentElement.lang = chosen
  },
})
</script>

<template>
  <UiSelect v-model="language" :label="t('preferences.language')" :options="LANGUAGES" />
</template>
