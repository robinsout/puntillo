import { describe, expect, it } from 'vitest'
import type { PianoSound } from '@/application/ports'
import { createKeySound } from '@/application/sound'
import type { PianoKey } from '@/domain/keyboard'
import type { NoteInput } from '@/domain/session'

// Feature piano-keyboard, criteria 13–15 and edge cases 1–3: with the piano keyboard and the sound
// of the keys on, the samples start loading on the first press or touch on the page, not when it
// opens, and a key played sounds. With the names of the notes or the sound off nothing is loaded
// and nothing sounds; once the sound is turned on, the samples load on the next press. A key
// played before the samples are loaded is silent: that is the port's promise, not checked here.

const C4: PianoKey = { number: 60 }
const F_SHARP_4: PianoKey = { number: 66 }

// Changed in place by a test, as the preferences change after the sound of the keys is made.
interface Settings {
  noteInput: NoteInput
  playKeys: boolean
}

function recordingSound() {
  const calls: (['load'] | ['play', PianoKey])[] = []
  const sound: PianoSound = {
    load() {
      calls.push(['load'])
    },
    play(key) {
      calls.push(['play', key])
    },
  }
  const loads = () => calls.filter(([call]) => call === 'load').length
  const played = () => calls.flatMap((call) => (call[0] === 'play' ? [call[1]] : []))
  return { sound, calls, loads, played }
}

function keySound(initial: Settings) {
  const settings: Settings = { ...initial }
  const recording = recordingSound()
  return { ...recording, settings, keySound: createKeySound(recording.sound, settings) }
}

describe('the sound of the keys', () => {
  it('loads nothing when it is made', () => {
    const { calls } = keySound({ noteInput: 'keyboard', playKeys: true })

    expect(calls).toEqual([])
  })

  describe('on the first press on the page', () => {
    it('loads the samples with the piano keyboard and the sound on', () => {
      const { keySound: made, loads, played } = keySound({ noteInput: 'keyboard', playKeys: true })

      made.prepare()

      expect(loads()).toBe(1)
      expect(played()).toEqual([])
    })

    it('loads nothing with the names of the notes', () => {
      const { keySound: made, calls } = keySound({ noteInput: 'names', playKeys: true })

      made.prepare()

      expect(calls).toEqual([])
    })

    it('loads nothing with the sound off', () => {
      const { keySound: made, calls } = keySound({ noteInput: 'keyboard', playKeys: false })

      made.prepare()

      expect(calls).toEqual([])
    })

    it('loads the samples once the piano keyboard is chosen after it was made', () => {
      const { keySound: made, settings, loads } = keySound({ noteInput: 'names', playKeys: true })
      made.prepare()

      settings.noteInput = 'keyboard'
      made.prepare()

      expect(loads()).toBeGreaterThanOrEqual(1)
    })
  })

  describe('a key played', () => {
    it('sounds with the sound on', () => {
      const { keySound: made, played } = keySound({ noteInput: 'keyboard', playKeys: true })
      made.prepare()

      made.play(F_SHARP_4)

      expect(played()).toEqual([F_SHARP_4])
    })

    it('sounds each time it is played, keys one after another', () => {
      const { keySound: made, played } = keySound({ noteInput: 'keyboard', playKeys: true })
      made.prepare()

      made.play(C4)
      made.play(F_SHARP_4)
      made.play(C4)

      expect(played()).toEqual([C4, F_SHARP_4, C4])
    })

    it('loads the samples before it sounds when nothing was loaded yet', () => {
      const { keySound: made, calls } = keySound({ noteInput: 'keyboard', playKeys: true })

      made.play(C4)

      expect(calls).toEqual([['load'], ['play', C4]])
    })

    it('neither loads nor sounds with the sound off', () => {
      const { keySound: made, calls } = keySound({ noteInput: 'keyboard', playKeys: false })
      made.prepare()

      made.play(C4)

      expect(calls).toEqual([])
    })

    it('loads and sounds once the sound is turned on after it was made (edge case 3)', () => {
      const {
        keySound: made,
        settings,
        loads,
        played,
      } = keySound({
        noteInput: 'keyboard',
        playKeys: false,
      })
      made.prepare()
      made.play(C4)

      settings.playKeys = true
      made.play(F_SHARP_4)

      expect(loads()).toBeGreaterThanOrEqual(1)
      expect(played()).toEqual([F_SHARP_4])
    })

    it('is silent once the sound is turned off after it was made', () => {
      const {
        keySound: made,
        settings,
        played,
      } = keySound({
        noteInput: 'keyboard',
        playKeys: true,
      })
      made.prepare()
      made.play(C4)

      settings.playKeys = false
      made.play(F_SHARP_4)

      expect(played()).toEqual([C4])
    })
  })
})
