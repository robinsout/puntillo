<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Question } from '@/domain/question'
import { StaffView, type StaffLayout } from '@/infrastructure/notation'
import { noteBoxes } from './note-boxes'

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
}>()
const emit = defineEmits<{ drawn: []; 'load-error': []; choose: [index: number] }>()

// About 30rem on a desktop, where the drawing is at its full scale.
const MAX_BAR_WIDTH = 480

const { t } = useI18n()
const captionId = useId()
const incorrectMarkId = useId()

// The layout of an earlier question must not place the targets of this one.
const drawn = shallowRef<{ question: Question; layout: StaffLayout }>()
function onDrawn(layout: StaffLayout) {
  drawn.value = { question: props.question, layout }
  emit('drawn')
}

const boxes = computed(() =>
  props.targets && drawn.value?.question === props.question ? noteBoxes(drawn.value.layout) : [],
)

const describedBy = (index: number, target: NoteTarget) =>
  [target.caption ? `${captionId}-${index}` : '', target.marked ? incorrectMarkId : '']
    .filter(Boolean)
    .join(' ') || undefined
</script>

<template>
  <div class="staff">
    <StaffView
      :question="question"
      :label="label"
      :max-bar-width="MAX_BAR_WIDTH"
      @load-error="emit('load-error')"
      @drawn="onDrawn"
    />
    <template v-if="targets">
      <button
        v-for="(box, index) in boxes"
        :key="index"
        type="button"
        class="target"
        :class="{ current: index === current, marked: targets[index]?.marked }"
        :style="box"
        :aria-label="t('trainer.note', { number: index + 1 })"
        :aria-current="index === current ? 'true' : undefined"
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
