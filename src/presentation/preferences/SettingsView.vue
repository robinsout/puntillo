<script setup lang="ts">
import { computed, onMounted, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useMidiInput } from '@/presentation/dependencies'
import { ShortcutsButton, useMidiStatus, useSessionStore } from '@/presentation/session'
import { UiCheckbox, UiSection } from '@/presentation/ui'
import LanguageChoice from './LanguageChoice.vue'
import NoteInputChoice from './NoteInputChoice.vue'
import NoteNamingChoice from './NoteNamingChoice.vue'
import SeventhNoteChoice from './SeventhNoteChoice.vue'
import StorageNotice from './StorageNotice.vue'
import { usePreferencesStore } from './preferences-store'

const { t } = useI18n()
const preferences = usePreferencesStore()
const session = useSessionStore()
const midiInput = useMidiInput()
const title = useTemplateRef('title')

// Browsers may ask the user for MIDI only within the gesture that ticks the box.
function chooseUseMidi(on: boolean) {
  preferences.chooseUseMidi(on)
  if (on) midiInput.connect()
}

// A browser without MIDI says so whether the box is ticked or not.
const midi = useMidiStatus()
const midiUnsupported = computed(() => midi.status.value.kind === 'unsupported')
const midiLine = computed(() =>
  preferences.useMidi || midiUnsupported.value ? midi.line.value : null,
)
const midiLineId = useId()

onMounted(() => title.value?.focus())
</script>

<template>
  <main class="screen">
    <h1 ref="title" tabindex="-1">{{ t('settings.title') }}</h1>
    <UiSection :title="t('settings.general')">
      <LanguageChoice />
      <NoteNamingChoice />
      <SeventhNoteChoice v-if="preferences.noteNaming === 'letter'" />
      <UiCheckbox
        :model-value="session.showAnswerAtOnce"
        @update:model-value="session.setShowAnswerAtOnce"
        >{{ t('session.showAnswerAtOnce') }}</UiCheckbox
      >
      <UiCheckbox :model-value="session.autoNext" @update:model-value="session.setAutoNext">{{
        t('trainer.openNextAutomatically')
      }}</UiCheckbox>
      <ShortcutsButton />
    </UiSection>
    <UiSection :title="t('session.readNotes')">
      <NoteInputChoice />
      <template v-if="preferences.noteInput === 'keyboard'">
        <UiCheckbox
          :model-value="preferences.playKeys"
          @update:model-value="preferences.choosePlayKeys"
          data-sound-switch
          >{{ t('preferences.playKeys') }}</UiCheckbox
        >
        <UiCheckbox
          :model-value="preferences.useMidi"
          @update:model-value="chooseUseMidi"
          :disabled="midiUnsupported"
          :aria-describedby="midiLine ? midiLineId : undefined"
        >
          {{ t('preferences.useMidi') }}
        </UiCheckbox>
        <p v-if="midiLine" :id="midiLineId" role="status" class="notice">{{ midiLine }}</p>
        <UiCheckbox
          v-if="preferences.useMidi"
          :model-value="preferences.midiSound"
          @update:model-value="preferences.chooseMidiSound"
          data-sound-switch
        >
          {{ t('preferences.midiSound') }}
        </UiCheckbox>
      </template>
    </UiSection>
    <UiSection :title="t('session.writeNotes')">
      <UiCheckbox
        :model-value="preferences.showNoteNames"
        @update:model-value="preferences.chooseShowNoteNames"
        >{{ t('session.showNoteNames') }}</UiCheckbox
      >
    </UiSection>
    <StorageNotice />
    <RouterLink to="/" class="nav-link">{{ t('wiki.trainer') }}</RouterLink>
  </main>
</template>

<style scoped>
.notice {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
