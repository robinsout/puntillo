import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SessionLength, TimeLimit } from '@/domain/session'

interface Progress {
  readonly length: SessionLength
  readonly number: number
  readonly elapsedMs: number
}

const formatTime = (totalSeconds: number) =>
  `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`

// "Time: 1:24" of a session on time.
export function useTimeText() {
  const { t } = useI18n()
  return (elapsedMs: number, { minutes }: TimeLimit): string => {
    // The question begun can still be answered after the time is up, but the time shown stays at
    // the limit, so that it does not look like the session runs on.
    const seconds = Math.floor(Math.min(elapsedMs / 1000, minutes * 60))
    return t('session.time', { time: formatTime(seconds) })
  }
}

// A session on time shows the time passed instead of the question number.
export function useProgressText(progress: Ref<Progress | null | undefined>) {
  const { t } = useI18n()
  const timeText = useTimeText()
  return computed(() => {
    if (!progress.value) return ''
    const { length, number, elapsedMs } = progress.value
    if (length === 'unlimited') return t('session.question', { number })
    if (typeof length === 'number') return t('session.questionOf', { number, length })
    return timeText(elapsedMs, length)
  })
}
