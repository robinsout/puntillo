<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: number; max: number; label: string }>()

const share = computed(() => (props.max > 0 ? Math.min(props.value / props.max, 1) : 0))
</script>

<template>
  <div
    class="ui-progress"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="value"
  >
    <div class="fill" :style="{ '--share': share }" />
  </div>
</template>

<style scoped>
.ui-progress {
  height: var(--line-progress);
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--color-line);
}

.fill {
  width: 100%;
  height: 100%;
  background: var(--color-accent);
  transform: scaleX(var(--share));
  transform-origin: left;
}
</style>
