<script setup lang="ts">
import type { Duration } from '@/domain/question'

// Drawn here rather than taken from a music font, so no system font can change or hide a note.
const { value } = defineProps<{ value: Duration['value'] }>()

interface Ellipse {
  cx: number
  cy: number
  rx: number
  ry: number
  // Degrees; negative tilts the long axis up to the right, as on a printed note head.
  angle: number
}

// Two half arcs, so a hole can be cut out of a head with the even-odd rule.
function ellipsePath({ cx, cy, rx, ry, angle }: Ellipse): string {
  const radians = (angle * Math.PI) / 180
  const dx = rx * Math.cos(radians)
  const dy = rx * Math.sin(radians)
  const arc = (x: number, y: number) => `A ${rx} ${ry} ${angle} 1 1 ${x} ${y}`
  return `M ${cx + dx} ${cy + dy} ${arc(cx - dx, cy - dy)} ${arc(cx + dx, cy + dy)} Z`
}

const HEAD: Ellipse = { cx: 9, cy: 26, rx: 5.2, ry: 3.6, angle: -20 }
const HEAD_HOLE: Ellipse = { ...HEAD, rx: 4.3, ry: 1.8, angle: -35 }
const WHOLE: Ellipse = { cx: 11, cy: 26, rx: 6.6, ry: 4.3, angle: 0 }
const WHOLE_HOLE: Ellipse = { ...WHOLE, rx: 3.6, ry: 2.2, angle: -55 }

const STEM_WIDTH = 1.4
const STEM_TOP = 3
// The right edge of the tilted head, worked out for HEAD: the stem stands on it.
const STEM_RIGHT = 14.05
const STEM_FOOT = 25

const FILLED_HEAD = ellipsePath(HEAD)

const HEADS: Record<Duration['value'], string> = {
  whole: ellipsePath(WHOLE) + ellipsePath(WHOLE_HOLE),
  half: FILLED_HEAD + ellipsePath(HEAD_HOLE),
  quarter: FILLED_HEAD,
  eighth: FILLED_HEAD,
}

const FLAG =
  `M ${STEM_RIGHT} ${STEM_TOP} ` +
  `C ${STEM_RIGHT + 0.4} 8 ${STEM_RIGHT + 6.2} 9.5 ${STEM_RIGHT + 4.6} 17.5 ` +
  `C ${STEM_RIGHT + 4.9} 12.5 ${STEM_RIGHT + 2} 11 ${STEM_RIGHT} 10 Z`
</script>

<template>
  <svg
    class="duration-image"
    viewBox="0 0 22 32"
    aria-hidden="true"
    focusable="false"
    fill="currentColor"
    stroke="none"
  >
    <path :d="HEADS[value]" fill-rule="evenodd" />
    <rect
      v-if="value !== 'whole'"
      :x="STEM_RIGHT - STEM_WIDTH"
      :y="STEM_TOP"
      :width="STEM_WIDTH"
      :height="STEM_FOOT - STEM_TOP"
    />
    <path v-if="value === 'eighth'" :d="FLAG" />
  </svg>
</template>

<style scoped>
/* Scales with the text, so a larger font gives a larger note. */
.duration-image {
  display: block;
  height: 1.75em;
  margin-inline: auto;
}
</style>
