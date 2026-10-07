<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { LETTERS } from '@/domain/pitch'
import { latinSyllableName } from '@/domain/naming'
import { StaffView } from '@/infrastructure/notation'
import { useTrainerStore } from './trainer-store'

const { t } = useI18n()
const store = useTrainerStore()

const staffFailed = ref(false)
const action = useTemplateRef('action')

const message = computed(() => {
  const { grade, hint } = store.state
  if (grade) return t(grade.correct ? 'trainer.correct' : 'trainer.incorrect')
  return hint ? t('trainer.chooseNoteNameFirst') : ''
})

// Кнопка действия меняется на месте: фокус переходит на появившуюся.
async function focusAction() {
  await nextTick()
  action.value?.focus()
}

async function check() {
  store.check()
  if (store.state.grade) await focusAction()
}

async function next() {
  store.next()
  await focusAction()
}
</script>

<template>
  <main class="trainer">
    <h1 class="visually-hidden">{{ t('trainer.heading') }}</h1>

    <p v-if="staffFailed" class="staff-error" role="alert">{{ t('trainer.staffLoadError') }}</p>
    <template v-else>
      <StaffView
        :question="store.state.question"
        :label="t('trainer.staffLabel')"
        @load-error="staffFailed = true"
      />

      <div class="names">
        <button
          v-for="letter in LETTERS"
          :key="letter"
          type="button"
          class="name"
          :aria-pressed="store.state.selected === letter"
          :disabled="store.state.grade !== null"
          @click="store.select(letter)"
        >
          {{ latinSyllableName(letter) }}
        </button>
      </div>

      <p
        role="status"
        class="message"
        :class="{
          correct: store.state.grade?.correct,
          incorrect: store.state.grade?.correct === false,
        }"
      >
        {{ message }}
      </p>

      <button v-if="store.state.grade" ref="action" type="button" class="action" @click="next">
        {{ t('trainer.next') }}
      </button>
      <button v-else ref="action" type="button" class="action" @click="check">
        {{ t('trainer.check') }}
      </button>
    </template>
  </main>
</template>

<style scoped>
.trainer {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  max-width: 40rem;
  margin-inline: auto;
  padding-block: max(var(--space-m), env(safe-area-inset-top))
    max(var(--space-m), env(safe-area-inset-bottom));
  padding-inline: max(var(--space-m), env(safe-area-inset-left))
    max(var(--space-m), env(safe-area-inset-right));
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.names {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--target-size), 1fr));
  gap: var(--space-s);
}

button {
  min-width: var(--target-size);
  min-height: var(--target-size);
  padding-inline: var(--space-s);
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

/* Выбор виден не только цветом: кнопка залита и выделена жирным. */
.name[aria-pressed='true'] {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-surface);
  font-weight: 700;
}

/* После результата ответ не меняется. Выбранная кнопка остаётся залитой. */
.name:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.action {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-weight: 700;
}

/* Строка резервирует высоту, чтобы кнопка действия не прыгала. */
.message {
  min-height: 1lh;
  margin: 0;
}

.correct {
  color: var(--color-success);
}

.incorrect {
  color: var(--color-danger);
}

.staff-error {
  margin: 0;
}
</style>
