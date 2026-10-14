<script setup lang="ts">
import { computed, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
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
  <!-- The Why? buttons stay next to their sentences, inside the region: a review is announced
       with them, which tells that each sentence has its explanation. -->
  <p
    ref="status"
    role="status"
    class="message"
    :class="{ correct: correctness === true, incorrect: correctness === false }"
  >
    <!-- A new node per question: the same text replacing itself is not announced. -->
    <span v-if="notes" :key="number">
      <span v-for="(note, noteIndex) in notes" :key="noteIndex">
        {{ note.before }}
        <span v-for="sentence in note.sentences" :key="sentence.id" class="sentence">
          <span :id="sentence.id">{{ sentence.text }}</span>
          {{ ' ' }}
          <button type="button" :aria-describedby="sentence.id" @click="openHint(sentence)">
            {{ t('wiki.why') }}
          </button>
          {{ ' ' }}
        </span>
        {{ note.after }}
      </span>
    </span>
    <span v-else :key="number">{{ message }}</span>
  </p>
  <component
    :is="hintDialog"
    v-if="hint && hintDialog"
    :topic="hint.topic"
    @close="closeHint"
    @read="readArticle"
  />
</template>

<style scoped>
/* Each sentence of a review with its Why? on a line of its own, so the buttons do not break the text. */
.sentence {
  display: block;
}

/* Reserves a line so that the action button does not jump. */
.message {
  min-height: 1lh;
  margin: 0;
}

.correct {
  color: var(--color-correct);
}

.incorrect {
  color: var(--color-wrong);
}
</style>
