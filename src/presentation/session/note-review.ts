import { useI18n } from 'vue-i18n'
import type { NoteChoice, TrainerState, WritingTrainerState } from '@/application/trainer'
import { keyOf, type PianoKey } from '@/domain/keyboard'
import { isEnharmonic, type Alteration, type Letter, type Pitch } from '@/domain/pitch'
import {
  alterationSource,
  cancelledByNatural,
  isSameDuration,
  signMistake,
  type Accidental,
  type Cancellation,
  type Duration,
  type Note,
  type Question,
} from '@/domain/question'
import { staffPosition, type StaffPosition } from '@/domain/staff'
import { cancellationTopic, type WikiTopic } from '@/domain/wiki'
import type { NoteNames } from './note-names'

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

export function placeKey(position: StaffPosition): string {
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

// What a natural cancels, in either exercise.
function useCancellation() {
  const { t } = useI18n()
  return function cancellationSentence(cancelled: Cancellation | undefined): ReviewSentence | null {
    if (!cancelled) return null
    const sign = cancelled.accidental === 'sharp' ? 'Sharp' : 'Flat'
    const source = cancelled.source === 'key signature' ? 'InKeySignature' : 'InBar'
    return {
      text: t(`trainer.naturalCancels${sign}${source}`),
      topic: cancellationTopic(cancelled),
    }
  }
}

// A name is said in words, a key played and the note for it are written with their octaves.
export function useNoteReview({
  inWords: nameOf,
  written,
  keyCaption,
}: Pick<NoteNames, 'inWords' | 'written' | 'keyCaption'>) {
  const { t } = useI18n()
  const cancellationSentence = useCancellation()

  const cancellationReason = (question: Question, index: number): ReviewSentence | null =>
    cancellationSentence(cancelledByNatural(question, index))

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

  const placeOf = (question: Question, pitch: Pitch) =>
    t(placeKey(staffPosition(pitch, question.clef)))

  function nameSentences(
    question: Question,
    pitch: Pitch,
    selected: Letter,
    alteration: Alteration | undefined,
  ): ReviewSentence[] {
    if (selected === pitch.letter && alteration === pitch.alteration) return []
    const sentences: ReviewSentence[] = [
      {
        text: t('trainer.review', {
          chosen: nameOf(selected, alteration),
          expected: nameOf(pitch.letter, pitch.alteration),
          place: placeOf(question, pitch),
        }),
        topic: 'treble-staff',
      },
    ]
    if (isEnharmonic({ letter: selected, alteration }, pitch))
      sentences.push({
        text: t('trainer.sameSound', {
          chosen: nameOf(selected, alteration),
          expected: nameOf(pitch.letter, pitch.alteration),
          written: nameOf(pitch.letter),
        }),
        topic: 'accidentals',
      })
    return sentences
  }

  // A key that sounds as the note is right, so a key never needs the sentence on the same sound.
  function keySentences(question: Question, pitch: Pitch, key: PianoKey): ReviewSentence[] {
    if (keyOf(pitch).number === key.number) return []
    return [
      {
        text: t('trainer.keyReview', {
          chosen: keyCaption(key),
          expected: written(pitch),
          place: placeOf(question, pitch),
        }),
        topic: 'treble-staff',
      },
    ]
  }

  function pitchSentences(question: Question, pitch: Pitch, choice: NoteChoice): ReviewSentence[] {
    if (choice.key) return keySentences(question, pitch, choice.key)
    if (choice.selected)
      return nameSentences(question, pitch, choice.selected, choice.alteration ?? undefined)
    return []
  }

  // One sentence for each part wrong in the last attempt, the pitch first.
  function reviewOf(
    question: Question,
    index: number,
    { pitch, duration }: Note,
    choice: NoteChoice,
  ): ReviewSentence[] {
    const sentences = pitchSentences(question, pitch, choice)
    if (sentences.length > 0) {
      const reason = alterationReason(question, index)
      if (reason) sentences.push(reason)
    }
    const { selectedDuration } = choice
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
        return {
          number: several ? index + 1 : null,
          sentences: reviewOf(question, index, note, notes[index] as NoteChoice),
        }
      })
      .filter(({ sentences }) => sentences.length > 0)
  }
}

// The name of a note spelt with a sign before it, a natural included: "fa♯", "fa♮".
export type Spell = (letter: Letter, sign?: Accidental) => string

export const soundingSign = (alteration?: Alteration): Accidental | undefined =>
  alteration === undefined ? undefined : alteration > 0 ? 'sharp' : 'flat'

// Write notes says what was written and what is needed: the place of the note, its sign with the
// reason for it, its duration.
export function useWritingReview(spell: Spell) {
  const { t } = useI18n()
  const cancellationSentence = useCancellation()
  const named = ({ letter, octave }: Pitch, sign?: Accidental) => `${spell(letter, sign)}${octave}`

  function signReason(
    question: Question,
    index: number,
    sign: Accidental | undefined,
  ): ReviewSentence | null {
    const mistake = signMistake(question, index, sign)
    const { pitch } = question.notes[index] as Note
    const name = spell(pitch.letter, soundingSign(pitch.alteration))
    switch (mistake?.kind) {
      case undefined:
        return null
      case 'natural needed':
        return cancellationSentence(mistake.cancels)
      case 'sign needed':
        return { text: t('writing.sign.needed', { name }), topic: 'accidentals' }
      case 'not needed':
        if (mistake.source === 'key signature')
          return {
            text: t('writing.sign.fromKeySignature', { name }),
            topic: 'key-signatures',
          }
        if (mistake.source === 'earlier in the bar')
          return { text: t('writing.sign.fromBar', { name }), topic: 'accidentals' }
        return { text: t('writing.sign.notNeeded'), topic: 'accidentals' }
    }
  }

  function pitchSentences(
    question: Question,
    index: number,
    placed: Pitch,
    sign: Accidental | undefined,
  ): ReviewSentence[] {
    const note = question.notes[index] as Note
    const written = named(placed, sign)
    if (placed.letter !== note.pitch.letter || placed.octave !== note.pitch.octave)
      return [
        {
          text: t('writing.review', {
            written,
            expected: named(note.pitch, soundingSign(note.pitch.alteration)),
            place: t(placeKey(staffPosition(note.pitch, question.clef))),
          }),
          topic: 'treble-staff',
        },
      ]
    const reason = signReason(question, index, sign)
    if (!reason) return []
    return [
      {
        text: t('writing.signReview', { written, expected: named(note.pitch, note.accidental) }),
        topic: 'accidentals',
      },
      reason,
    ]
  }

  return function review({ question, notes, askDuration }: WritingTrainerState): NoteReview[] {
    const several = question.notes.length > 1
    return question.notes
      .map(({ duration }, index): NoteReview => {
        const { placed, accidental, selectedDuration } = notes[index] ?? {}
        const sentences = placed
          ? pitchSentences(question, index, placed, accidental ?? undefined)
          : []
        if (askDuration && selectedDuration && !isSameDuration(selectedDuration, duration))
          sentences.push({
            text: t('writing.durationReview', {
              written: t(durationKey('chosen', selectedDuration)),
              expected: t(durationKey('expected', duration)),
            }),
            topic: 'durations',
          })
        return { number: several ? index + 1 : null, sentences }
      })
      .filter(({ sentences }) => sentences.length > 0)
  }
}
