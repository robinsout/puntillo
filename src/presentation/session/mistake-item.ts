import { useI18n } from 'vue-i18n'
import { noteName } from '@/domain/naming'
import type { ReviewItem } from '@/domain/review-queue'
import { usePreferencesStore } from '@/presentation/preferences'

function useItemNames() {
  const { t } = useI18n()
  const preferences = usePreferencesStore()
  return ({ pitch, duration: { value, dots } }: ReviewItem) => ({
    name: `${noteName(pitch.letter, preferences.noteNaming, preferences.seventhNote, pitch.alteration)}${pitch.octave}`,
    duration: t(`writing.${dots ? 'taskDottedDuration' : 'taskDuration'}.${value}`),
  })
}

// An item as a line of Most mistakes says it: "F♯4, quarter note".
export function useItemText() {
  const { t } = useI18n()
  const names = useItemNames()
  return (item: ReviewItem): string => t('results.item', names(item))
}

// An item with its mistakes, as Hardest notes says it: "F♯4, quarter note — …".
export function useMistakeItemText() {
  const { t } = useI18n()
  const names = useItemNames()
  return (item: ReviewItem, mistakes: string): string =>
    t('results.mistakeItem', { ...names(item), mistakes })
}
