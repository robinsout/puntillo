<script setup lang="ts">
import { computed, inject, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Locale } from '@/domain/language'
import { preferencesKey } from '@/presentation/dependencies'

const preferences = inject(preferencesKey)
if (!preferences) throw new Error('Preferences are not provided: provide them with preferencesKey')

// Each language is named in itself, so the names are not translated.
const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', ru: 'Русский', es: 'Español' }

const { t, locale } = useI18n()
const id = useId()

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
  <div class="language">
    <label :for="id">{{ t('preferences.language') }}</label>
    <select :id="id" v-model="language">
      <option v-for="(name, code) in LANGUAGE_NAMES" :key="code" :value="code" :lang="code">
        {{ name }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.language {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}
</style>
