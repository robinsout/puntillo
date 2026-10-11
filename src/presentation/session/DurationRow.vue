<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Duration } from '@/domain/question'
import { DURATION_FRACTIONS } from './duration-fractions'

export interface DurationMarks {
  isIncorrect(value: Duration['value']): boolean
  isCorrect(value: Duration['value']): boolean
  // The id of the hidden text describing the mark.
  markOf(value: Duration['value']): string | undefined
}

defineProps<{
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
}>()
const emit = defineEmits<{ choose: [value: Duration['value'], event: MouseEvent]; dot: [] }>()

const { t } = useI18n()

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
      <button
        v-for="value in durations"
        :key="value"
        type="button"
        class="choice"
        :class="{ wrong: marks.isIncorrect(value), right: marks.isCorrect(value) }"
        :aria-label="shapes ? t(`trainer.duration.${value}`) : undefined"
        :aria-pressed="selected === value"
        :aria-describedby="marks.markOf(value)"
        :disabled="isDisabled(value)"
        @click="emit('choose', value, $event)"
      >
        <span v-if="shapes" class="shape">{{ SHAPES[value] }}</span>
        <template v-else>{{ DURATION_FRACTIONS[value] }}</template>
      </button>
      <button
        v-if="dots"
        type="button"
        class="choice"
        :aria-pressed="dot"
        :disabled="dotDisabled"
        @click="emit('dot')"
      >
        {{ t('trainer.dot') }}
      </button>
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
  font-size: 1.5rem;
  line-height: 1;
}

.placeholder {
  min-height: var(--target-size);
}

/* The selected button stays filled while disabled. */
.choice:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

/* Marks rest on shape, not only on colour: a wrong choice is in a dashed frame. */
.choice.wrong {
  border-style: dashed;
  border-color: var(--color-danger);
  text-decoration: line-through;
}

/* The right choice gets a double-width frame and stays at full strength among disabled ones. */
.choice.right:disabled {
  border-color: var(--color-success);
  box-shadow: inset 0 0 0 2px var(--color-success);
  opacity: 1;
  font-weight: 700;
}
</style>
