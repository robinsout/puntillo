import { useI18n } from 'vue-i18n'
import type { TrainerState } from '@/application/trainer'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { staffPosition, type StaffPosition } from '@/domain/staff'

function placeKey(position: StaffPosition): string {
  switch (position.kind) {
    case 'ledger-line-below':
      return `trainer.place.ledgerLineBelow${position.number}`
    case 'below-ledger-line':
      return `trainer.place.belowLedgerLine${position.number}`
    case 'ledger-line-above':
      return `trainer.place.ledgerLineAbove${position.number}`
    case 'above-ledger-line':
      return `trainer.place.aboveLedgerLine${position.number}`
    case 'below-staff':
      return 'trainer.place.belowStaff'
    case 'above-staff':
      return 'trainer.place.aboveStaff'
    case 'line':
      return `trainer.place.line${position.number}`
    case 'space':
      return `trainer.place.space${position.number}`
  }
}

export function useNoteReview(nameOf: (letter: Letter) => string) {
  const { t } = useI18n()

  // One sentence for each part wrong in the last attempt, the name first.
  function reviewOf(
    question: Question,
    { pitch, duration }: Note,
    selected: Letter | null,
    selectedDuration: Duration | null,
  ): string {
    const sentences: string[] = []
    if (selected && selected !== pitch.letter)
      sentences.push(
        t('trainer.review', {
          chosen: nameOf(selected),
          expected: nameOf(pitch.letter),
          place: t(placeKey(staffPosition(pitch, question.clef))),
        }),
      )
    if (selectedDuration && selectedDuration.value !== duration.value)
      sentences.push(
        t('trainer.durationReview', {
          chosen: t(`trainer.chosenDuration.${selectedDuration.value}`),
          expected: t(`trainer.expectedDuration.${duration.value}`),
        }),
      )
    return sentences.join(' ')
  }

  // With several notes, each wrong note is reviewed under its number.
  return function review({ question, notes }: TrainerState): string {
    const reviews = question.notes.map((note, index) => {
      const choice = notes[index]
      return reviewOf(question, note, choice?.selected ?? null, choice?.selectedDuration ?? null)
    })
    if (reviews.length === 1) return reviews[0] ?? ''
    return reviews
      .map((text, index) =>
        text ? t('trainer.noteReview', { number: index + 1, review: text }) : '',
      )
      .filter(Boolean)
      .join(' ')
  }
}
