<script setup lang="ts">
import { ref } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { UiButton, UiDialog } from '@/presentation/ui'
import KeyList from './KeyList.vue'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
// Mounted for one opening.
const open = ref(true)

interface Keys {
  readonly keys: readonly string[]
  readonly between: string
}

// A sentence such as "A…J white, W…U black" puts its keys in its own places.
interface Sentence {
  readonly message: string
  readonly parts: Readonly<Record<string, Keys>>
}

interface Row {
  readonly action: string
  readonly keys: Keys | Sentence
}

const SLASH = ' / '

const SECTIONS: readonly { readonly title: string; readonly rows: readonly Row[] }[] = [
  {
    title: 'session.readNotes',
    rows: [
      {
        action: 'shortcuts.noteNames',
        keys: { keys: ['A', 'S', 'D', 'F', 'G', 'H', 'J'], between: ' ' },
      },
      { action: 'shortcuts.sharpFlat', keys: { keys: ['=', '−'], between: SLASH } },
      {
        action: 'shortcuts.pianoKeys',
        keys: {
          message: 'shortcuts.pianoKeysKeys',
          parts: {
            white: { keys: ['A', 'J'], between: '…' },
            black: { keys: ['W', 'U'], between: '…' },
          },
        },
      },
      { action: 'shortcuts.octave', keys: { keys: ['Z', 'X'], between: SLASH } },
    ],
  },
  {
    title: 'session.writeNotes',
    rows: [
      { action: 'shortcuts.noteUpDown', keys: { keys: ['↑', '↓'], between: SLASH } },
      { action: 'shortcuts.signs', keys: { keys: ['=', '−', '0'], between: SLASH } },
    ],
  },
  {
    title: 'shortcuts.both',
    rows: [
      {
        action: 'shortcuts.durations',
        keys: {
          message: 'shortcuts.durationsKeys',
          parts: {
            digits: { keys: ['1', '2', '3', '4', '5'], between: ' ' },
            dot: { keys: ['.'], between: '' },
          },
        },
      },
      { action: 'shortcuts.checkNext', keys: { keys: ['Enter'], between: '' } },
      { action: 'shortcuts.previousNextNote', keys: { keys: ['←', '→'], between: SLASH } },
    ],
  },
]
</script>

<template>
  <UiDialog v-model:open="open" :title="t('shortcuts.title')" @close="emit('close')">
    <table v-for="section in SECTIONS" :key="section.title">
      <caption>
        {{
          t(section.title)
        }}
      </caption>
      <tbody>
        <tr v-for="row in section.rows" :key="row.action">
          <th scope="row">{{ t(row.action) }}</th>
          <td>
            <I18nT v-if="'message' in row.keys" :keypath="row.keys.message" scope="global">
              <template v-for="(part, name) in row.keys.parts" :key="name" #[name]>
                <KeyList v-bind="part" />
              </template>
            </I18nT>
            <KeyList v-else v-bind="row.keys" />
          </td>
        </tr>
      </tbody>
    </table>
    <template #actions>
      <UiButton @click="open = false">{{ t('shortcuts.close') }}</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
/* The three tables share their columns, so the keys stand in one line. */
table {
  width: 100%;
  border-collapse: collapse;
}

caption {
  padding-block: var(--space-xs);
  text-align: start;
  font-weight: var(--font-weight-bold);
}

th,
td {
  padding-block: var(--space-s);
  border-top: var(--line-thin) solid var(--color-line);
  text-align: start;
  vertical-align: baseline;
}

th {
  width: 50%;
  padding-inline-end: var(--space-m);
  font-weight: var(--font-weight-regular);
}
</style>
