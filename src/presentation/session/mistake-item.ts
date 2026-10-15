import { useI18n } from 'vue-i18n'
import { noteName } from '@/domain/naming'
import type { ReviewItem } from '@/domain/review-queue'
import { usePreferencesStore } from '@/presentation/preferences'

// An item as a line of Most mistakes or Hardest notes says it: "F♯4, quarter note".
export function useItemText() {
  const { t } = useI18n()
  const preferences = usePreferencesStore()
  return ({ pitch, duration: { value, dots } }: ReviewItem): string =>
    t('results.item', {
      name: `${noteName(pitch.letter, preferences.noteNaming, preferences.seventhNote, pitch.alteration)}${pitch.octave}`,
      duration: t(`writing.${dots ? 'taskDottedDuration' : 'taskDuration'}.${value}`),
    })
}
