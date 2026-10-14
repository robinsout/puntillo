import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SessionLength, TimeLimit } from '@/domain/session'

export interface Progress {
  readonly length: SessionLength
  readonly number: number
  readonly elapsedMs: number
}

const formatTime = (totalSeconds: number) =>
  `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`

// The question begun can still be answered after the time is up, but the time shown stays at the
// limit, so that it does not look like the session runs on.
const secondsShown = (elapsedMs: number, { minutes }: TimeLimit) =>
  Math.floor(Math.min(elapsedMs / 1000, minutes * 60))

// "Time: 1:24" of a session on time.
export function useTimeText() {
  const { t } = useI18n()
  return (elapsedMs: number, limit: TimeLimit): string =>
    t('session.time', { time: formatTime(secondsShown(elapsedMs, limit)) })
}

export interface SessionBar {
  // Null without a limit: there is nothing to fill.
  readonly bar: { readonly value: number; readonly max: number; readonly label: string } | null
  readonly count: string
}

// A counted session fills the bar by the questions, "1 / 10"; a session on time by the time
// passed, "1:24"; without a limit only the number is shown, "Question 7".
export function useSessionBar(progress: Ref<Progress | null | undefined>) {
  const { t } = useI18n()
  const timeText = useTimeText()
  return computed((): SessionBar | null => {
    if (!progress.value) return null
    const { length, number, elapsedMs } = progress.value
    if (length === 'unlimited') return { bar: null, count: t('session.question', { number }) }
    if (typeof length === 'number') {
      const label = t('session.questionOf', { number, length })
      return { bar: { value: number, max: length, label }, count: `${number} / ${length}` }
    }
    const seconds = secondsShown(elapsedMs, length)
    return {
      bar: { value: seconds, max: length.minutes * 60, label: timeText(elapsedMs, length) },
      count: formatTime(seconds),
    }
  })
}
