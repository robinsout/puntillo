import { useI18n } from 'vue-i18n'
import type { SessionRecord } from '@/domain/progress'
import { EXERCISE_NAME_KEYS } from '@/presentation/preferences'
import { useLengthName } from '@/presentation/session'

const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }

// The British order, "13 Oct", is the one the feature names; plain English would say "Oct 13".
const dateLocale = (locale: string) => (locale === 'en' ? 'en-GB' : locale)

export interface SessionRecordParts {
  readonly date: string
  readonly details: readonly string[]
  readonly accuracy: string
}

// The parts of a session as Recent sessions says it: "13 Oct · Write notes · 5 min · 12 questions
// · 67%". A length of a number of questions is not said apart from the questions.
export function useSessionRecordParts() {
  const { t, locale } = useI18n()
  const lengthName = useLengthName()
  return ({
    finishedAt,
    exercise,
    length,
    questions,
    accuracy,
  }: SessionRecord): SessionRecordParts => ({
    date: new Intl.DateTimeFormat(dateLocale(locale.value), DATE).format(finishedAt),
    details: [
      t(EXERCISE_NAME_KEYS[exercise]),
      ...(typeof length === 'number' ? [] : [lengthName(length)]),
      t('progress.questionCount', questions),
    ],
    accuracy: t('progress.percent', { percent: accuracy }),
  })
}
