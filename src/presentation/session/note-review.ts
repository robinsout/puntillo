import { useI18n } from 'vue-i18n'
import type { TrainerState } from '@/application/trainer'
import { isEnharmonic, type Alteration, type Letter } from '@/domain/pitch'
import {
  alterationSource,
  cancelledByNatural,
  isSameDuration,
  type Duration,
  type Note,
  type Question,
} from '@/domain/question'
import { staffPosition, type StaffPosition } from '@/domain/staff'
import type { WikiTopic } from '@/domain/wiki'

// Each sentence names the topic of the wiki that explains it, for its Why?.
export interface ReviewSentence {
  readonly text: string
  readonly topic: WikiTopic
}

// The sentences about one wrong note; numbered only in a question of several notes.
export interface NoteReview {
  readonly number: number | null
  readonly sentences: readonly ReviewSentence[]
}

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

  function cancellationReason(question: Question, index: number): ReviewSentence | null {
    const cancelled = cancelledByNatural(question, index)
    if (!cancelled) return null
    const sign = cancelled.accidental === 'sharp' ? 'Sharp' : 'Flat'
    return cancelled.source === 'key signature'
      ? { text: t(`trainer.naturalCancels${sign}InKeySignature`), topic: 'key-signatures' }
      : { text: t(`trainer.naturalCancels${sign}InBar`), topic: 'accidentals' }
  }

  function alterationReason(question: Question, index: number): ReviewSentence | null {
    const { alteration } = question.notes[index]?.pitch ?? {}
    if (alteration === undefined) return cancellationReason(question, index)
    const sharp = alteration > 0
    switch (alterationSource(question, index)) {
      case 'key signature':
        return {
          text: t(sharp ? 'trainer.sharpFromKeySignature' : 'trainer.flatFromKeySignature'),
          topic: 'key-signatures',
        }
      case 'earlier in the bar':
        return {
          text: t(sharp ? 'trainer.sharpFromBar' : 'trainer.flatFromBar'),
          topic: 'accidentals',
        }
      default:
        return null
    }
  }

  // One sentence for each part wrong in the last attempt, the name first.
  function reviewOf(
    question: Question,
    index: number,
    { pitch, duration }: Note,
    selected: Letter | null,
    alteration: Alteration | undefined,
    selectedDuration: Duration | null,
  ): ReviewSentence[] {
    const sentences: ReviewSentence[] = []
    if (selected && (selected !== pitch.letter || alteration !== pitch.alteration)) {
      sentences.push({
        text: t('trainer.review', {
          chosen: nameOf(selected, alteration),
          expected: nameOf(pitch.letter, pitch.alteration),
          place: t(placeKey(staffPosition(pitch, question.clef))),
        }),
        topic: 'treble-staff',
      })
      if (isEnharmonic({ letter: selected, alteration }, pitch))
        sentences.push({
          text: t('trainer.sameSound', {
            chosen: nameOf(selected, alteration),
            expected: nameOf(pitch.letter, pitch.alteration),
            written: nameOf(pitch.letter),
          }),
          topic: 'accidentals',
        })
      const reason = alterationReason(question, index)
      if (reason) sentences.push(reason)
    }
    if (selectedDuration && !isSameDuration(selectedDuration, duration))
      sentences.push({
        text: t('trainer.durationReview', {
          chosen: t(durationKey('chosen', selectedDuration)),
          expected: t(durationKey('expected', duration)),
        }),
        topic: 'durations',
      })
    return sentences
  }

  // With several notes, each wrong note is reviewed under its number.
  return function review({ question, notes }: TrainerState): NoteReview[] {
    const several = question.notes.length > 1
    return question.notes
      .map((note, index): NoteReview => {
        const choice = notes[index]
        return {
          number: several ? index + 1 : null,
          sentences: reviewOf(
            question,
            index,
            note,
            choice?.selected ?? null,
            choice?.alteration ?? undefined,
            choice?.selectedDuration ?? null,
          ),
        }
      })
      .filter(({ sentences }) => sentences.length > 0)
  }
}
