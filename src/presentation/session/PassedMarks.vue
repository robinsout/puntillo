<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import type { Row } from '@/application/session'
import type { Clef } from '@/domain/staff'
import type { StaffLayout } from '@/infrastructure/notation'
import { UiIcon } from '@/presentation/ui'
import { topBelow, yOfPitch } from './below-staff'

const props = defineProps<{ clef: Clef; layout: StaffLayout; row: Row }>()
// How far the marks may reach below the drawing, in pixels, for the staff to make room for them.
const emit = defineEmits<{ overflow: [pixels: number] }>()

// Each line keeps its row under the lowest note the difficulty may ask, whatever is passed, so
// that the staff keeps its height from the first question of a row on.
const lines = computed(() =>
  props.layout.lines.map((band, line) => ({
    top: `${topBelow(band, yOfPitch(props.row.lowest, props.clef, band)) * 100}%`,
    marks: props.layout.passed.flatMap(({ x, line: on }, index) =>
      on === line ? [{ left: `${x * 100}%`, right: props.row.passed[index]?.right ?? false }] : [],
    ),
  })),
)

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
watch(lines, measure)
</script>

<template>
  <!-- The progress of the session says how far it has gone to a screen reader. -->
  <div ref="root" class="passed-marks" aria-hidden="true">
    <div v-for="(each, line) in lines" :key="line" class="line" :style="{ top: each.top }">
      <UiIcon
        v-for="(mark, index) in each.marks"
        :key="index"
        :name="mark.right ? 'check' : 'cross'"
        size="s"
        class="mark"
        :class="mark.right ? 'right' : 'wrong'"
        :style="{ left: mark.left }"
      />
    </div>
  </div>
</template>

<style scoped>
.passed-marks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.line {
  position: absolute;
  right: 0;
  left: 0;
  height: var(--icon-size-s);
}

.mark {
  position: absolute;
  transform: translateX(-50%);
}

.right {
  color: var(--color-correct);
}

.wrong {
  color: var(--color-wrong);
}
</style>
