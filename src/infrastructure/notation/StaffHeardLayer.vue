<script setup lang="ts">
import { computed } from 'vue'
import { heardShape, type HeardPlaces } from './staff-heard'
import type { StaffHeard } from './staff-marks'

const props = defineProps<{
  heard: StaffHeard
  places: HeardPlaces
  viewBox: string
  font: { readonly family: string; readonly size: string }
}>()

const HEAD = ''
const SIGNS = { sharp: '\uE262', flat: '\uE260', natural: '\uE261' }
const LEDGER_WIDTH = 1
const ARROW_WIDTH = 1.5
const fill = { fill: 'var(--color-heard)' }
const stroke = { stroke: 'var(--color-heard)' }

const shape = computed(() => heardShape(props.heard, props.places))
const points = (head: readonly { x: number; y: number }[]) =>
  head.map(({ x, y }) => `${x},${y}`).join(' ')
</script>

<!-- Drawn over the staff without drawing it again; decoration, the indicator above reads it. -->
<template>
  <svg
    class="heard-layer"
    :viewBox="viewBox"
    aria-hidden="true"
    focusable="false"
    pointer-events="none"
  >
    <g
      v-if="shape?.kind === 'note'"
      class="heard-note"
      :style="fill"
      :font-family="font.family"
      :font-size="font.size"
    >
      <line
        v-for="(line, index) in shape.ledgerLines"
        :key="index"
        :x1="line.x1"
        :x2="line.x2"
        :y1="line.y"
        :y2="line.y"
        :style="stroke"
        :stroke-width="LEDGER_WIDTH"
      />
      <text v-if="shape.sign" :x="shape.sign.x" :y="shape.sign.y">
        {{ SIGNS[shape.sign.kind] }}
      </text>
      <text :x="shape.head.x" :y="shape.head.y">{{ HEAD }}</text>
    </g>
    <g v-else-if="shape?.kind === 'arrow'" class="heard-arrow" :style="fill">
      <line
        :x1="shape.stem.x"
        :x2="shape.stem.x"
        :y1="shape.stem.y1"
        :y2="shape.stem.y2"
        :style="stroke"
        :stroke-width="ARROW_WIDTH"
      />
      <polygon :points="points(shape.head)" />
    </g>
  </svg>
</template>

<style scoped>
/* Over the drawing of VexFlow, at its size: the same viewBox and the same width. */
.heard-layer {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  display: block;
  inline-size: 100%;
}
</style>
