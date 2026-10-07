<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LETTERS } from '@/domain/pitch'
import { latinSyllableName } from '@/domain/naming'
import { StaffView } from '@/infrastructure/notation'
import { useSessionStore } from './session-store'

const { t } = useI18n()
const store = useSessionStore()

// Экран вопроса показывается только в фазе вопроса; на других фазах снимка нет.
const current = computed(() => store.question)

const staffFailed = ref(false)
const action = useTemplateRef('action')

const number = computed(() => {
  if (!current.value) return ''
  const { length, number } = current.value
  return length === 'unlimited'
    ? t('session.question', { number })
    : t('session.questionOf', { number, length })
})

const message = computed(() => {
  if (!current.value) return ''
  const { grade, hint } = current.value.trainer
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
  if (store.question?.trainer.grade) await focusAction()
}

async function next() {
  store.next()
  await focusAction()
}

// Автопереход ведёт себя как «Next»: фокус с кнопки действия переходит на «Check».
// После последнего вопроса экран сменяется итогом, и фокус переносит SessionView.
// Наблюдатель срабатывает до перерисовки, пока на месте ещё прежняя кнопка.
watch(
  () => store.autoAdvances,
  async () => {
    if (document.activeElement === action.value) await focusAction()
  },
)
</script>

<template>
  <main v-if="current" class="screen">
    <h1 class="visually-hidden" tabindex="-1">{{ t('trainer.heading') }}</h1>

    <p>{{ number }}</p>

    <p v-if="staffFailed" class="staff-error" role="alert">{{ t('trainer.staffLoadError') }}</p>
    <template v-else>
      <StaffView
        :question="current.trainer.question"
        :label="t('trainer.staffLabel')"
        @load-error="staffFailed = true"
      />

      <div class="names">
        <button
          v-for="letter in LETTERS"
          :key="letter"
          type="button"
          class="name"
          :aria-pressed="current.trainer.selected === letter"
          :disabled="current.trainer.grade !== null"
          @click="store.select(letter)"
        >
          {{ latinSyllableName(letter) }}
        </button>
      </div>

      <p
        role="status"
        class="message"
        :class="{
          correct: current.trainer.grade?.correct,
          incorrect: current.trainer.grade?.correct === false,
        }"
      >
        {{ message }}
      </p>

      <button v-if="current.trainer.grade" ref="action" type="button" class="primary" @click="next">
        {{ current.isLast ? t('session.toResults') : t('trainer.next') }}
      </button>
      <button v-else ref="action" type="button" class="primary" @click="check">
        {{ t('trainer.check') }}
      </button>

      <label class="auto-next">
        <input
          type="checkbox"
          :checked="store.autoNext"
          @change="store.setAutoNext(($event.target as HTMLInputElement).checked)"
        />
        {{ t('trainer.openNextAutomatically') }}
      </label>
    </template>
  </main>
</template>

<style scoped>
.names {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--target-size), 1fr));
  gap: var(--space-s);
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

.auto-next {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  min-height: var(--target-size);
  cursor: pointer;
}

.auto-next input {
  width: 1.25em;
  height: 1.25em;
  margin: 0;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.auto-next input:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.staff-error {
  margin: 0;
}
</style>
