<script setup lang="ts">
import { onMounted, useId, useTemplateRef } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import KeyList from './KeyList.vue'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const dialog = useTemplateRef('dialog')
const titleId = useId()

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

onMounted(() => dialog.value?.showModal())

// The content fills the dialog box, so only a press on the backdrop targets the dialog itself.
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) dialog.value?.close()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="shortcuts"
    :aria-labelledby="titleId"
    @close="emit('close')"
    @click="onClick"
  >
    <div class="content">
      <h2 :id="titleId">{{ t('shortcuts.title') }}</h2>
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
      <button type="button" class="close" @click="dialog?.close()">
        {{ t('shortcuts.close') }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.shortcuts {
  box-sizing: border-box;
  width: min(32rem, 100% - 2 * var(--space-m));
  max-width: none;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  color: var(--color-text);
  background: var(--color-surface);
}

.shortcuts::backdrop {
  background: rgb(0 0 0 / 0.4);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  padding: var(--space-m);
}

h2 {
  margin: 0;
}

/* The three tables share their columns, so the keys stand in one line. */
table {
  width: 100%;
  border-collapse: collapse;
}

caption {
  text-align: start;
  font-weight: 700;
}

th,
td {
  padding-block: calc(var(--space-s) / 2);
  text-align: start;
  vertical-align: baseline;
}

th {
  width: 50%;
  padding-inline-end: var(--space-m);
  font-weight: 400;
}

.close {
  align-self: flex-end;
}
</style>
