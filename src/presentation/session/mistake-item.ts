import { useI18n } from 'vue-i18n'
import { noteName } from '@/domain/naming'
import type { ReviewItem } from '@/domain/review-queue'
import { usePreferencesStore } from '@/presentation/preferences'

// An item with its mistakes, as Most mistakes and Hardest notes say it: "F♯4, quarter note — …".
export function useMistakeItemText() {
  const { t } = useI18n()
  const preferences = usePreferencesStore()
  return ({ pitch, duration: { value, dots } }: ReviewItem, mistakes: string): string =>
    t('results.mistakeItem', {
      name: `${noteName(pitch.letter, preferences.noteNaming, preferences.seventhNote, pitch.alteration)}${pitch.octave}`,
      duration: t(`writing.${dots ? 'taskDottedDuration' : 'taskDuration'}.${value}`),
      mistakes,
    })
}
