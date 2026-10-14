import type { PianoKey } from '@/domain/keyboard'
import type { PianoSound } from '@/application/ports'
import type { Preferences } from '@/application/preferences'

export interface KeySound {
  // Called on every press or touch on the page: the first one is the gesture that lets sound start.
  prepare(): void
  play(key: PianoKey): void
  // A key pressed on the MIDI instrument: it has a sound setting of its own.
  playMidi(key: PianoKey): void
}

export function createKeySound(
  sound: PianoSound,
  settings: Pick<Preferences, 'noteInput' | 'playKeys' | 'useMidi' | 'midiSound'>,
): KeySound {
  let loading = false
  const load = () => {
    if (loading) return
    loading = true
    sound.load()
  }
  const midiSounds = () => settings.useMidi && settings.midiSound
  const playIf = (on: boolean, key: PianoKey) => {
    if (!on) return
    load()
    sound.play(key)
  }
  return {
    prepare() {
      if (settings.noteInput === 'keyboard' && (settings.playKeys || midiSounds())) load()
    },
    play(key) {
      playIf(settings.playKeys, key)
    },
    playMidi(key) {
      playIf(midiSounds(), key)
    },
  }
}
