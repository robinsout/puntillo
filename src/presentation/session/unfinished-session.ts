import { useI18n } from 'vue-i18n'
import type { SavedSession } from '@/domain/progress'
import { accuracyPercent } from '@/domain/session'
import { EXERCISE_NAME_KEYS } from '@/presentation/preferences'
import { useTimeText } from './progress'

// A session not finished as the choice screen says it: "Read notes · question 7 of 20 · 86%".
export function useUnfinishedSessionText() {
  const { t } = useI18n()
  const timeText = useTimeText()
  const position = ({ length, number, elapsedMs }: SavedSession): string => {
    if (length === 'unlimited') return t('progress.question', { number })
    if (typeof length === 'number') return t('progress.questionOf', { number, length })
    return timeText(elapsedMs, length)
  }
  return (saved: SavedSession): string =>
    [
      t(EXERCISE_NAME_KEYS[saved.exercise]),
      position(saved),
      // A session is saved from its first check on, so it always has an accuracy.
      t('progress.percent', { percent: accuracyPercent(saved.score) ?? 0 }),
    ].join(' · ')
}
