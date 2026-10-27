<script setup lang="ts">
import { shallowRef, useId } from 'vue'
import type { Row } from '@/application/session'
import { COMMON_TIME, createQuestionOf, type Note } from '@/domain/question'
import { StaffView, type StaffLayout } from '@/infrastructure/notation'
import PassedMarks from '@/presentation/session/PassedMarks.vue'

const quarter = (letter: Note['pitch']['letter'], octave: number): Note => ({
  pitch: { letter, octave },
  duration: { value: 'quarter' },
})

const PASSED: readonly Note[] = [quarter('D', 4), quarter('G', 4), quarter('C', 5), quarter('E', 4)]
const QUESTION = createQuestionOf(COMMON_TIME, [quarter('A', 4)])
const ROW: Row = {
  passed: PASSED.map((note, index) => ({ note, right: index !== 2 })),
  final: true,
  slots: { keySignatures: 0, signs: false, flags: false },
  lowest: { letter: 'C', octave: 4 },
}

const layout = shallowRef<StaffLayout>()

const headingId = useId()
</script>

<template>
  <section :aria-labelledby="headingId">
    <h2 :id="headingId">Staff row</h2>
    <p class="description">
      A row of ten questions of one note: the notes passed in muted colour, the current note right
      of them, an empty staff to the end of the row. Under each passed note the mark of its first
      attempt, in one row as low as the lowest note of the difficulty.
    </p>
    <div class="staff">
      <StaffView
        :question="QUESTION"
        label="Example"
        :passed="PASSED"
        :row-length="10"
        :row-end="ROW.final ? 'final' : 'single'"
        :row-slots="ROW.slots"
        @drawn="layout = $event"
      />
      <PassedMarks v-if="layout" :clef="QUESTION.clef" :layout="layout" :row="ROW" />
    </div>
  </section>
</template>

<style scoped>
.staff {
  position: relative;
}

.description {
  color: var(--color-text-muted);
}
</style>
