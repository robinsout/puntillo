<script setup lang="ts">
import { computed, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiIcon } from '@/presentation/ui'
import type { NoteReview } from './note-review'
import { useReviewHints } from './review-hints'

const props = defineProps<{
  // The review of a question ended wrong, or null for the message.
  review: readonly NoteReview[] | null
  message: string
  // The question the status is about: a new node per question is announced anew.
  number: number
  correctness?: boolean
}>()

const { t } = useI18n()
const reviewId = useId()

// Each sentence of the review is followed by its Why?, so the wording of a numbered note is split
// around its sentences.
const REVIEW_MARK = '\u0000'
const notes = computed(() => {
  let index = 0
  return props.review?.map(({ number, sentences }) => {
    const [before = '', after = ''] =
      number === null
        ? []
        : t('trainer.noteReview', { number, review: REVIEW_MARK }).split(REVIEW_MARK)
    return {
      before,
      after,
      sentences: sentences.map((sentence) => {
        const each = { ...sentence, index, id: `${reviewId}-${index}` }
        index += 1
        return each
      }),
    }
  })
})

const { hint, hintDialog, openHint, closeHint, readArticle } = useReviewHints(
  useTemplateRef('status'),
)
</script>

<template>
  <!-- A result is a card, a hint plain text. The region stays the same node either way, so that
       its changes are announced. -->
  <div
    class="result"
    :class="{ card: correctness !== undefined }"
    :data-testid="correctness === undefined ? undefined : 'status-card'"
  >
    <!-- The heading stays out of the region, so that a review is announced as it was. -->
    <p v-if="notes" class="heading incorrect">
      <UiIcon name="cross" />
      {{ t('trainer.incorrect') }}
    </p>
    <div class="line">
      <UiIcon
        v-if="!notes && correctness !== undefined"
        :name="correctness ? 'check' : 'cross'"
        :class="correctness ? 'correct' : 'incorrect'"
      />
      <!-- The Why? buttons stay next to their sentences, inside the region: a review is announced
           with them, which tells that each sentence has its explanation. -->
      <div
        ref="status"
        role="status"
        class="message"
        :class="{ correct: correctness === true, incorrect: correctness === false && !notes }"
      >
        <!-- A new node per question: the same text replacing itself is not announced. -->
        <span v-if="notes" :key="number" class="review">
          <span v-for="(note, noteIndex) in notes" :key="noteIndex" class="note">
            <span v-if="note.before.trim()" class="note-text">{{ note.before }}</span>
            <span v-for="sentence in note.sentences" :key="sentence.id" class="sentence">
              <span :id="sentence.id" class="sentence-text">{{ sentence.text }}</span>
              {{ ' ' }}
              <button
                type="button"
                class="why"
                :aria-describedby="sentence.id"
                @click="openHint(sentence)"
              >
                {{ t('wiki.why') }}
              </button>
              {{ ' ' }}
            </span>
            <span v-if="note.after.trim()" class="note-text">{{ note.after }}</span>
          </span>
        </span>
        <span v-else :key="number">{{ message }}</span>
      </div>
    </div>
  </div>
  <component
    :is="hintDialog"
    v-if="hint && hintDialog"
    :topic="hint.topic"
    @close="closeHint"
    @read="readArticle"
  />
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.card {
  padding: var(--space-m);
  border: var(--line-thin) solid var(--color-line);
  border-radius: var(--radius-l);
  background: var(--color-surface);
}

.heading {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-bold);
}

.line {
  display: flex;
  align-items: flex-start;
  gap: var(--space-s);
}

/* Reserves a line so that the action button does not jump. */
.message {
  flex: 1;
  min-width: 0;
  min-height: 1lh;
}

.review,
.note {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

/* Each sentence of a review on a line of its own with its Why? on the right: the sentence wraps
   beside the button, which does not break the text. */
.sentence {
  display: flex;
  align-items: flex-start;
  gap: var(--space-s);
}

.sentence-text {
  flex: 1;
  min-width: 0;
}

.why {
  flex: none;
  border-width: var(--line-thin);
  border-radius: var(--radius-pill);
  background: var(--color-ground);
  color: var(--color-accent);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-s);
}

.correct {
  color: var(--color-correct);
}

.incorrect {
  color: var(--color-wrong);
}
</style>
