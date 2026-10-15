<script setup lang="ts">
import { computed, ref, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Question } from '@/domain/question'
import { StaffView, type StaffLayout } from '@/infrastructure/notation'
import { MAX_BAR_WIDTH } from './bar-width'
import { noteBoxes } from './note-boxes'
import StaffCaptions from './StaffCaptions.vue'
import type { StaffMark } from './staff-marks'

export interface NoteTarget {
  // The answer written under the note, empty until it is complete.
  readonly caption: string
  readonly open: boolean
  readonly marked: boolean
}

const props = defineProps<{
  question: Question
  label: string
  // Targets are laid over a question of several notes only, once the answer can be given.
  targets: readonly NoteTarget[] | null
  current: number
  captionLang?: string
  // Once the question is checked; the ghosts are the answers.
  result?: readonly StaffMark[] | null
  // The element that says the result to a screen reader.
  resultId?: string
}>()
const emit = defineEmits<{ drawn: []; 'load-error': []; choose: [index: number] }>()

const { t } = useI18n()
const captionId = useId()
const incorrectMarkId = useId()

// The layout of an earlier question must not place the targets of this one.
const drawn = shallowRef<{ question: Question; layout: StaffLayout }>()
function onDrawn(layout: StaffLayout) {
  drawn.value = { question: props.question, layout }
  emit('drawn')
}

const layout = computed(() =>
  drawn.value?.question === props.question ? drawn.value.layout : undefined,
)
const boxes = computed(() => (props.targets && layout.value ? noteBoxes(layout.value) : []))

// The captions of the result may reach below the drawing; the staff grows to hold them.
const captionRoom = ref(0)
const roomStyle = computed(() =>
  props.result && captionRoom.value > 0 ? { marginBottom: `${captionRoom.value}px` } : undefined,
)

// Once the question is checked no note is current any more.
const highlighted = computed(() => (props.result ? -1 : props.current))

const marks = computed(() => props.result?.map(({ mark }) => mark))
const ghosts = computed(() =>
  props.result?.map(({ ghost }) => ghost && { pitch: ghost, mark: 'wrong' as const }),
)

const describedBy = (index: number, target: NoteTarget) =>
  [target.caption ? `${captionId}-${index}` : '', target.marked ? incorrectMarkId : '']
    .filter(Boolean)
    .join(' ') || undefined
</script>

<template>
  <div class="staff" :style="roomStyle">
    <StaffView
      :question="question"
      :label="label"
      :max-bar-width="MAX_BAR_WIDTH"
      :marks="marks"
      :ghosts="ghosts"
      :aria-describedby="resultId"
      @load-error="emit('load-error')"
      @drawn="onDrawn"
    />
    <template v-if="targets">
      <button
        v-for="(box, index) in boxes"
        :key="index"
        type="button"
        class="target"
        :class="{ current: index === highlighted, marked: targets[index]?.marked }"
        :style="box"
        :aria-label="t('trainer.note', { number: index + 1 })"
        :aria-current="index === highlighted ? 'true' : undefined"
        :aria-describedby="targets[index] && describedBy(index, targets[index])"
        :disabled="!targets[index]?.open"
        @click="emit('choose', index)"
      >
        <span :id="`${captionId}-${index}`" class="caption" :lang="captionLang">{{
          targets[index]?.caption
        }}</span>
      </button>
      <span v-if="targets.some((target) => target.marked)" :id="incorrectMarkId" hidden>{{
        t('trainer.incorrect')
      }}</span>
    </template>
    <StaffCaptions
      v-if="result && layout"
      :question="question"
      :layout="layout"
      :result="result"
      :lang="captionLang"
      :below-bands="!!targets"
      @overflow="captionRoom = $event"
    />
  </div>
</template>

<style scoped>
.staff {
  position: relative;
}

.target {
  position: absolute;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
}

.target:disabled {
  cursor: default;
}

/* The four states differ by the frame, not only by colour: none, solid, dashed, and dashed
   around a solid ring for a marked note that is current. */
.target.current {
  border: var(--line-thick) solid var(--color-accent);
}

.target.marked {
  border: var(--line-medium) dashed var(--color-wrong);
}

.target.marked.current {
  border-width: var(--line-thick);
  box-shadow: inset 0 0 0 var(--line-thick) var(--color-accent);
}

/* A caption wider than its target breaks between the name and the duration rather than spill
   under the neighbouring note: the widths of the system font are not known in advance. */
.caption {
  font-size: var(--font-size-s);
  text-align: center;
}
</style>
