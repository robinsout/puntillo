<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoteNaming } from '@/domain/naming'
import { usePreferencesStore } from './preferences-store'

// Each system is named by its first three notes, so the names are not translated.
const SYSTEMS: Record<NoteNaming, { name: string; lang?: string }> = {
  'latin-syllable': { name: 'do, re, mi' },
  'cyrillic-syllable': { name: 'до, ре, ми', lang: 'ru' },
  letter: { name: 'C, D, E' },
}

const { t } = useI18n()
const store = usePreferencesStore()
const id = useId()

const naming = computed({
  get: () => store.noteNaming,
  set: (chosen: NoteNaming) => store.chooseNoteNaming(chosen),
})
</script>

<template>
  <div class="note-naming">
    <label :for="id">{{ t('preferences.noteNaming') }}</label>
    <select :id="id" v-model="naming">
      <option v-for="(system, code) in SYSTEMS" :key="code" :value="code" :lang="system.lang">
        {{ system.name }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.note-naming {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}
</style>
