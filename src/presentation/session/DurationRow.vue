<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Duration } from '@/domain/question'
import { UiAnswerKey } from '@/presentation/ui'
import type { ChoiceMarks } from './choice-marks'
import { DURATION_FRACTIONS } from './duration-fractions'
import KeyCaption from './KeyCaption.vue'
import { shortcutKeyOf, type Shortcut } from './shortcuts'

export type DurationMarks = ChoiceMarks<Duration['value']>

const props = defineProps<{
  durations: readonly Duration['value'][]
  // Whether Dot is offered.
  dots: boolean
  // Empty cells keep the place of the buttons until the staff is drawn.
  ready: boolean
  selected: Duration['value'] | null
  dot: boolean
  isDisabled: (value: Duration['value']) => boolean
  dotDisabled: boolean
  marks: DurationMarks
  // Write notes finds the shape for the name, so its buttons show the shape, not the fraction.
  shapes?: boolean
  // On a desktop the buttons show their keys.
  shortcuts?: boolean
}>()
const emit = defineEmits<{ choose: [value: Duration['value'], event: MouseEvent]; dot: [] }>()

const { t } = useI18n()

const shortcutKey = (shortcut: Shortcut) => (props.shortcuts ? shortcutKeyOf(shortcut) : undefined)

// SMuFL precomposed notes, stem up. Bravura is loaded with VexFlow, before the staff is drawn
// and so before the buttons appear.
const SHAPES: Record<Duration['value'], string> = {
  whole: '',
  half: '',
  quarter: '',
  eighth: '',
  sixteenth: '',
}
</script>

<template>
  <div class="durations">
    <template v-if="ready">
      <UiAnswerKey
        v-for="value in durations"
        :key="value"
        class="choice"
        :aria-label="shapes ? t(`trainer.duration.${value}`) : undefined"
        :pressed="selected === value"
        :mark="marks.markOf(value)"
        :aria-describedby="marks.describedBy(value)"
        :disabled="isDisabled(value)"
        :aria-keyshortcuts="shortcutKey({ type: 'duration', value })?.name"
        @click="emit('choose', value, $event)"
      >
        <span v-if="shapes" class="shape">{{ SHAPES[value] }}</span>
        <template v-else>{{ DURATION_FRACTIONS[value] }}</template>
        <KeyCaption :of="shortcutKey({ type: 'duration', value })" />
      </UiAnswerKey>
      <UiAnswerKey
        v-if="dots"
        class="choice"
        :pressed="dot"
        :mark="null"
        :disabled="dotDisabled"
        :aria-keyshortcuts="shortcutKey({ type: 'dot' })?.name"
        @click="emit('dot')"
      >
        {{ t('trainer.dot') }}
        <KeyCaption :of="shortcutKey({ type: 'dot' })" />
      </UiAnswerKey>
    </template>
    <template v-else>
      <span v-for="value in durations" :key="value" class="placeholder" />
    </template>
  </div>
</template>

<style scoped>
.durations {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--target-size), 1fr));
  gap: var(--space-s);
}

/* Six cells share a 360 px row: side padding would push a wider fallback font's fraction past the border. */
.choice {
  padding-inline: 0;
}

/* The glyphs sit on the baseline and reach far above it; a fixed line keeps the buttons even. */
.shape {
  font-family: Bravura, serif;
  font-size: var(--font-size-xl);
  line-height: 1;
}

.placeholder {
  min-height: var(--target-size);
}
</style>
