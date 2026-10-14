import type { PianoKey } from '@/domain/keyboard'
import type { PianoSound } from '@/application/ports'
import type { Preferences } from '@/application/preferences'

export interface KeySound {
  // Called on every press or touch on the page: the first one is the gesture that lets sound start.
  prepare(): void
  play(key: PianoKey): void
}

export function createKeySound(
  sound: PianoSound,
  settings: Pick<Preferences, 'noteInput' | 'playKeys'>,
): KeySound {
  let loading = false
  const load = () => {
    if (loading) return
    loading = true
    sound.load()
  }
  return {
    prepare() {
      if (settings.noteInput === 'keyboard' && settings.playKeys) load()
    },
    play(key) {
      if (!settings.playKeys) return
      load()
      sound.play(key)
    },
  }
}
