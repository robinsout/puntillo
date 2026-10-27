<script setup lang="ts">
import { useId } from 'vue'
import { COMMON_TIME, createQuestionOf, type Note } from '@/domain/question'
import { StaffView } from '@/infrastructure/notation'

const quarter = (letter: Note['pitch']['letter'], octave: number): Note => ({
  pitch: { letter, octave },
  duration: { value: 'quarter' },
})

const PASSED: readonly Note[] = [quarter('D', 4), quarter('G', 4), quarter('C', 5), quarter('E', 4)]
const QUESTION = createQuestionOf(COMMON_TIME, [quarter('A', 4)])

const headingId = useId()
</script>

<template>
  <section :aria-labelledby="headingId">
    <h2 :id="headingId">Staff row</h2>
    <p class="description">
      A row of ten questions of one note: the notes passed in muted colour, the current note right
      of them, an empty staff to the end of the row.
    </p>
    <StaffView
      :question="QUESTION"
      label="Example"
      :passed="PASSED"
      :row-length="10"
      row-end="final"
      :row-slots="{ keySignatures: 0, signs: false, flags: false }"
    />
  </section>
</template>

<style scoped>
.description {
  color: var(--color-text-muted);
}
</style>
