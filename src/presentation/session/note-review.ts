import { useI18n } from 'vue-i18n'
import type { TrainerState } from '@/application/trainer'
import { keySignatureLetters } from '@/domain/key-signature'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import { isSameDuration, type Duration, type Note, type Question } from '@/domain/question'
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

const durationKey = (form: 'chosen' | 'expected', { value, dots }: Duration): string =>
  `trainer.${form}${dots ? 'Dotted' : ''}Duration.${value}`

export function useNoteReview(nameOf: (letter: Letter, alteration?: Alteration) => string) {
  const { t } = useI18n()

  function alterationReason(question: Question, pitch: Pitch): string | null {
    if (pitch.alteration === undefined) return null
    if (!keySignatureLetters(question.keySignature).includes(pitch.letter)) return null
    return t(
      pitch.alteration > 0 ? 'trainer.sharpFromKeySignature' : 'trainer.flatFromKeySignature',
    )
  }

  // One sentence for each part wrong in the last attempt, the name first.
  function reviewOf(
    question: Question,
    { pitch, duration }: Note,
    selected: Letter | null,
    alteration: Alteration | undefined,
    selectedDuration: Duration | null,
  ): string {
    const sentences: string[] = []
    if (selected && (selected !== pitch.letter || alteration !== pitch.alteration)) {
      sentences.push(
        t('trainer.review', {
          chosen: nameOf(selected, alteration),
          expected: nameOf(pitch.letter, pitch.alteration),
          place: t(placeKey(staffPosition(pitch, question.clef))),
        }),
      )
      const reason = alterationReason(question, pitch)
      if (reason) sentences.push(reason)
    }
    if (selectedDuration && !isSameDuration(selectedDuration, duration))
      sentences.push(
        t('trainer.durationReview', {
          chosen: t(durationKey('chosen', selectedDuration)),
          expected: t(durationKey('expected', duration)),
        }),
      )
    return sentences.join(' ')
  }

  // With several notes, each wrong note is reviewed under its number.
  return function review({ question, notes }: TrainerState): string {
    const reviews = question.notes.map((note, index) => {
      const choice = notes[index]
      return reviewOf(
        question,
        note,
        choice?.selected ?? null,
        choice?.alteration ?? undefined,
        choice?.selectedDuration ?? null,
      )
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
