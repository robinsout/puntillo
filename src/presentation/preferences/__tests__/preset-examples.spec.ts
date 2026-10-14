import { describe, expect, it } from 'vitest'
import {
  allowedPitches,
  durationsOf,
  PRESETS,
  presetDifficulty,
  type Preset,
} from '@/domain/difficulty'
import { isSamePitch } from '@/domain/pitch'
import { isNote, isSameDuration, isSameTimeSignature } from '@/domain/question'
import { PRESET_EXAMPLES } from '@/presentation/preferences/preset-examples'

// Feature navigation-and-settings, slice 4, criterion 13: the small staff on the card of a preset
// shows a fixed example of it, written as data, not drawn by the generator: one note in 4/4 that
// the preset itself could ask, with the key signature it could have.

const EXAMPLES = [
  {
    preset: 'first-steps',
    pitch: { letter: 'G', octave: 4 },
    duration: { value: 'half' },
    keySignature: { count: 0 },
  },
  {
    preset: 'confident-reading',
    pitch: { letter: 'D', octave: 5 },
    duration: { value: 'quarter' },
    keySignature: { count: 1, accidental: 'sharp' },
  },
  {
    preset: 'advanced',
    pitch: { letter: 'A', octave: 5 },
    duration: { value: 'quarter', dots: 1 },
    keySignature: { count: 2, accidental: 'flat' },
  },
] as const

const exampleOf = (preset: Preset) => PRESET_EXAMPLES[preset]
const noteOf = (preset: Preset) => {
  const [note] = exampleOf(preset).notes
  return note
}

describe('the examples of the presets', () => {
  it('are one for each preset', () => {
    expect(Object.keys(PRESET_EXAMPLES).sort()).toEqual([...PRESETS].sort())
  })

  it.each(EXAMPLES)(
    'show $preset by its fixed note',
    ({ preset, pitch, duration, keySignature }) => {
      const example = exampleOf(preset)

      expect(example.clef).toBe('treble')
      expect(example.timeSignature).toEqual({ beats: 4, beatValue: 4 })
      expect(example.keySignature).toEqual(keySignature)
      expect(example.elements).toHaveLength(1)
      expect(example.notes).toHaveLength(1)
      expect(example.elements[0]).toBe(example.notes[0])
      expect(noteOf(preset).pitch).toEqual(pitch)
      expect(noteOf(preset).duration).toEqual(duration)
      expect(noteOf(preset).accidental).toBeUndefined()
    },
  )

  describe.each(PRESETS)('of %s', (preset) => {
    const difficulty = presetDifficulty(preset)

    it('hold a note of its range within its ledger lines', () => {
      const { pitch } = noteOf(preset)

      expect(allowedPitches(difficulty).some((allowed) => isSamePitch(allowed, pitch))).toBe(true)
    })

    it('hold a note of one of its durations', () => {
      const { duration } = noteOf(preset)

      expect(durationsOf(difficulty).some((allowed) => isSameDuration(allowed, duration))).toBe(
        true,
      )
    })

    it('are in one of its time signatures', () => {
      const { timeSignature } = exampleOf(preset)

      expect(
        difficulty.timeSignatures.some((each) => isSameTimeSignature(each, timeSignature)),
      ).toBe(true)
    })

    it('have no more signs in the key signature than it allows', () => {
      expect(exampleOf(preset).keySignature.count).toBeLessThanOrEqual(difficulty.keySignatures)
    })

    it('hold notes only, no rest', () => {
      expect(exampleOf(preset).elements.every(isNote)).toBe(true)
    })
  })
})
