<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isWhiteKey, middleWhiteIndex, type PianoKey } from '@/domain/keyboard'
import type { Question } from '@/domain/question'
import type { ChoiceMarks } from './choice-marks'
import KeyCaption from './KeyCaption.vue'
import { useNoteNames } from './note-names'

const props = defineProps<{
  // In the order of their sound, white and black.
  keys: readonly PianoKey[]
  // An empty place keeps the room of the keys until the staff is drawn.
  ready: boolean
  // A new question brings the middle of the keys back into view.
  question: Question
  pressed: PianoKey | null
  isDisabled: (key: PianoKey) => boolean
  // By the numbers of the keys.
  marks: ChoiceMarks<number>
  // The keys of the computer keyboard that play them, by the numbers of the keys.
  shortcuts: ReadonlyMap<number, string>
}>()
const emit = defineEmits<{ play: [key: PianoKey, event: MouseEvent] }>()

const { t } = useI18n()
const { keyName, keyLabel, lang } = useNoteNames()
const piano = useTemplateRef('piano')

// A white key stands after the white keys before it; a black key straddles the edge between two.
const places = computed(() => {
  let whites = 0
  return props.keys.map((key) => (isWhiteKey(key) ? whites++ : whites))
})
const whiteCount = computed(() => props.keys.filter(isWhiteKey).length)
const middle = computed(() => middleWhiteIndex(props.keys))

const isEnabled = (index: number) => !props.isDisabled(props.keys[index] as PianoKey)
const pressedIndex = computed(() => {
  const index = props.keys.findIndex(({ number }) => number === props.pressed?.number)
  return index === -1 ? null : index
})

// One Tab stop for all the keys: the key last reached by the arrows, else the key played for the
// current note, else the white key in the middle, moved to an enabled neighbour if need be.
const reached = ref<number | null>(null)
watch([() => props.question, () => props.pressed?.number], () => {
  reached.value = null
})

function nearestEnabled(index: number): number {
  for (let after = index; after < props.keys.length; after++) if (isEnabled(after)) return after
  for (let before = index - 1; before >= 0; before--) if (isEnabled(before)) return before
  return index
}

const tabStop = computed(() => nearestEnabled(reached.value ?? pressedIndex.value ?? middle.value))

const buttons = () => Array.from(piano.value?.querySelectorAll('button') ?? [])

function captionOf({ number }: PianoKey) {
  const shortcut = props.shortcuts.get(number)
  return shortcut === undefined ? undefined : { caption: shortcut, name: shortcut }
}

const STEPS: Partial<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowLeft: -1 }

function move(event: KeyboardEvent) {
  const step = STEPS[event.key]
  if (step === undefined) return
  event.preventDefault()
  const all = buttons()
  const from = all.indexOf(event.target as HTMLButtonElement)
  const ahead = step > 0 ? all.slice(from + 1) : all.slice(0, from).reverse()
  ahead.find((button) => !button.disabled)?.focus()
}

function centre() {
  const scroller = piano.value
  const key = buttons()[middle.value]
  if (!scroller || !key) return
  const view = scroller.getBoundingClientRect()
  const { left, width } = key.getBoundingClientRect()
  scroller.scrollLeft += left + width / 2 - (view.left + view.width / 2)
}

onMounted(centre)
watch([() => props.question, () => props.ready], () => nextTick(centre))
</script>

<template>
  <div
    v-if="ready"
    ref="piano"
    role="group"
    :aria-label="t('trainer.pianoKeyboard')"
    class="piano"
    @keydown="move"
  >
    <div class="keys" :style="{ '--whites': whiteCount }">
      <button
        v-for="(key, index) in keys"
        :key="key.number"
        type="button"
        class="key"
        :class="{
          white: isWhiteKey(key),
          black: !isWhiteKey(key),
          wrong: marks.isIncorrect(key.number),
          right: marks.isCorrect(key.number),
        }"
        :style="{ '--place': places[index] }"
        :tabindex="index === tabStop ? 0 : -1"
        :aria-label="keyName(key)"
        :aria-pressed="pressed?.number === key.number"
        :aria-describedby="marks.markOf(key.number)"
        :disabled="isDisabled(key)"
        :lang="lang"
        :aria-keyshortcuts="shortcuts.get(key.number)"
        @focus="reached = index"
        @click="emit('play', key, $event)"
      >
        <KeyCaption :of="captionOf(key)" />
        {{ keyLabel(key) }}
      </button>
    </div>
  </div>
  <div v-else class="piano placeholder" />
</template>

<style scoped>
/* Spec: a white key and the press of a black one are at least 44 px wide; the lower part of a white
   key, below the black keys, at least 44 px high. The middle of a white key, where a tap lands, is
   below the presses of the black keys, which are wider than the keys drawn. */
.piano {
  --white: var(--target-size);
  --black-height: 3.25rem;
  --white-height: calc(2 * var(--black-height) + var(--space-m));

  overflow-x: auto;
  /* Room for the focus ring, which the scrolling box would cut. */
  padding: var(--space-s);
}

.placeholder {
  height: var(--white-height);
}

.keys {
  position: relative;
  width: calc(var(--whites) * var(--white));
  height: var(--white-height);
  margin-inline: auto;
}

.key {
  position: absolute;
  top: 0;
  box-sizing: border-box;
  min-width: 0;
  padding: 0;
}

.key:focus-visible {
  z-index: 2;
}

.key:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.white {
  left: calc(var(--place) * var(--white));
  width: var(--white);
  height: var(--white-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: var(--space-s);
  border-radius: 0 0 var(--radius) var(--radius);
}

/* The button is the press, wider than the black key drawn inside it. */
.black {
  z-index: 1;
  left: calc((var(--place) - 0.5) * var(--white));
  width: var(--white);
  height: var(--black-height);
  border: 0;
  background: transparent;
}

.black::before {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline: calc(var(--white) / 5);
  box-sizing: border-box;
  border-radius: 0 0 var(--radius) var(--radius);
  background: var(--color-text);
}

/* The key of the computer keyboard stands above the name of a white key, at the foot of a black
   one, where the black keys do not cover it. */
.white .key-caption {
  position: static;
}

.black .key-caption {
  z-index: 1;
  inset-block: auto var(--space-s);
  inset-inline: 0;
  text-align: center;
  color: var(--color-surface);
  opacity: 1;
}

/* A pressed key is filled with the accent: filled in the text colour as a pressed button is, a white
   key would merge with the black keys. Pressed is not only a colour: a white key's name turns bold
   (the shared pressed style), a black key gets a light frame inside. */
.white[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-on-accent);
}

.black[aria-pressed='true']::before {
  background: var(--color-accent);
  box-shadow: inset 0 0 0 3px var(--color-surface);
}

/* Marks rest on shape, as on the name buttons: a wrong key is in a dashed frame, its name struck
   out; the right key gets a double-width frame and stays at full strength. */
.white.wrong {
  border-style: dashed;
  border-color: var(--color-danger);
  text-decoration: line-through;
}

.black.wrong::before {
  border: 3px dashed var(--color-danger);
}

.white.right:disabled {
  border-color: var(--color-success);
  box-shadow: inset 0 0 0 2px var(--color-success);
  font-weight: 700;
}

.black.right:disabled::before {
  box-shadow: 0 0 0 4px var(--color-success);
}

.key.right:disabled {
  opacity: 1;
}
</style>
