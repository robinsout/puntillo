<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Question } from '@/domain/question'
import { StaffView, type StaffLayout } from '@/infrastructure/notation'

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

const { t } = useI18n()
const captionId = useId()
const incorrectMarkId = useId()

// The layout of an earlier question must not place the targets of this one.
const drawn = shallowRef<{ question: Question; layout: StaffLayout }>()
function onDrawn(layout: StaffLayout) {
  drawn.value = { question: props.question, layout }
  emit('drawn')
}

// Each target spans halfway to its neighbouring notes and rests on its line, the outer ones as far
// out as in, and the height of its line. A note alone on its line takes the whole line. No target
// covers the clef, the time signature or a rest.
const boxes = computed(() => {
  if (!props.targets || drawn.value?.question !== props.question) return []
  const { notes, rests, lines } = drawn.value.layout
  return notes.map(({ x, line }) => {
    const others = [...notes, ...rests].filter((each) => each.line === line).map((each) => each.x)
    const before = Math.max(...others.filter((each) => each < x))
    const after = Math.min(...others.filter((each) => each > x))
    const toLeft = Number.isFinite(before) ? (x - before) / 2 : undefined
    const toRight = Number.isFinite(after) ? (after - x) / 2 : undefined
    const band = lines[line] ?? { left: 0, top: 0, bottom: 1 }
    const left = Math.max(band.left, x - (toLeft ?? toRight ?? 1))
    const right = Math.min(1, x + (toRight ?? toLeft ?? 1))
    return {
      left: `${left * 100}%`,
      width: `${(right - left) * 100}%`,
      top: `${band.top * 100}%`,
      height: `${(band.bottom - band.top) * 100}%`,
    }
  })
})

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
  border: 3px solid var(--color-accent);
}

.target.marked {
  border: 2px dashed var(--color-danger);
}

.target.marked.current {
  border-width: 3px;
  box-shadow: inset 0 0 0 3px var(--color-accent);
}

.caption {
  font-size: 0.875rem;
  white-space: nowrap;
}
</style>
