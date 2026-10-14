<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoteNaming } from '@/domain/naming'
import { UiSelect } from '@/presentation/ui'
import { usePreferencesStore } from './preferences-store'

// Each system is named by its first three notes, so the names are not translated.
const SYSTEMS: readonly { value: NoteNaming; label: string; lang?: string }[] = [
  { value: 'latin-syllable', label: 'do, re, mi' },
  { value: 'cyrillic-syllable', label: 'до, ре, ми', lang: 'ru' },
  { value: 'letter', label: 'C, D, E' },
]

const { t } = useI18n()
const store = usePreferencesStore()

const naming = computed({
  get: () => store.noteNaming,
  set: (chosen: NoteNaming) => store.chooseNoteNaming(chosen),
})
</script>

<template>
  <UiSelect v-model="naming" :label="t('preferences.noteNaming')" :options="SYSTEMS" />
</template>
