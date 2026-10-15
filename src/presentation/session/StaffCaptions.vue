<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import type { Question } from '@/domain/question'
import { stepFromBottomLine } from '@/domain/staff'
import type { StaffLayout } from '@/infrastructure/notation'
import type { StaffMark } from './staff-marks'

const props = defineProps<{
  question: Question
  layout: StaffLayout
  result: readonly StaffMark[]
  lang?: string
  // Below the targets over the notes, so that their frames do not cross the captions.
  belowBands?: boolean
}>()
// How far the captions reach below the drawing, in pixels, for the staff to make room for them.
const emit = defineEmits<{ overflow: [pixels: number] }>()

// In half staff spaces: below the staff the captions clear the stems down, below a low note or
// ghost its head.
const BELOW_STAFF = 4
const BELOW_HEAD = 3

// The captions of a line share one row, under the lowest of its notes and ghosts.
function rowTops(): Map<number, number> {
  const { notes, lines } = props.layout
  const tops = new Map<number, number>()
  notes.forEach(({ y, line }, index) => {
    const band = lines[line]
    if (!band) return
    const halfSpace = (band.bottomLine - band.topLine) / 8
    const ghost = props.result[index]?.ghost
    const ghostY = ghost
      ? band.bottomLine - stepFromBottomLine(ghost, props.question.clef) * halfSpace
      : -Infinity
    const top = Math.max(
      band.bottomLine + BELOW_STAFF * halfSpace,
      Math.max(y, ghostY) + BELOW_HEAD * halfSpace,
      props.belowBands ? band.bottom : -Infinity,
    )
    tops.set(line, Math.max(tops.get(line) ?? -Infinity, top))
  })
  return tops
}

// Centred under its note, as wide as it may be without reaching the caption of a neighbouring
// note or the edge of the drawing: a note alone on its line has the room of the whole line.
const captions = computed(() => {
  const { notes } = props.layout
  const tops = rowTops()
  return notes.map(({ x, line }, index) => {
    const neighbours = notes
      .filter((other, otherIndex) => other.line === line && otherIndex !== index)
      .map((other) => Math.abs(other.x - x) / 2)
    const half = Math.min(x, 1 - x, ...neighbours)
    return {
      style: {
        left: `${(x - half) * 100}%`,
        width: `${2 * half * 100}%`,
        top: `${(tops.get(line) ?? 0) * 100}%`,
      },
      caption: props.result[index]?.caption,
    }
  })
})

const root = useTemplateRef('root')
async function measure() {
  await nextTick()
  const element = root.value
  if (!element) return
  const bottom = element.getBoundingClientRect().bottom
  const lowest = Math.max(
    bottom,
    ...[...element.children].map((child) => child.getBoundingClientRect().bottom),
  )
  emit('overflow', lowest - bottom)
}
onMounted(measure)
watch(captions, measure)
</script>

<template>
  <!-- The review says the same to a screen reader. -->
  <div ref="root" class="captions" aria-hidden="true" :lang="lang">
    <template v-for="(each, index) in captions" :key="index">
      <div v-if="each.caption" class="caption" :style="each.style">
        <span class="correct">{{ each.caption.correct }}</span>
        <span class="yours">{{ each.caption.yours }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.captions {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.caption {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
  text-align: center;
  text-wrap: balance;
}

.correct {
  color: var(--color-correct);
}

.yours {
  color: var(--color-wrong);
}
</style>
