import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MidiStatus } from '@/application/ports'
import { useMidiInput } from '@/presentation/dependencies'

// The state of MIDI, heard only while active, and the line that tells it; none while the browser
// has not been asked or has not answered.
export function useMidiStatus(active: () => boolean = () => true) {
  const { t } = useI18n()
  const midiInput = useMidiInput()
  const status = shallowRef<MidiStatus>(midiInput.status())

  let stop = () => {}
  watch(
    active,
    (on) => {
      stop()
      stop = () => {}
      if (!on) return
      status.value = midiInput.status()
      stop = midiInput.onStatus((next) => (status.value = next))
    },
    { immediate: true },
  )
  onScopeDispose(() => stop())

  const line = computed(() => {
    const current = status.value
    switch (current.kind) {
      case 'ready':
        return current.instruments.length === 0
          ? t('preferences.midiStatus.noInstrument')
          : t('preferences.midiStatus.connected', { names: current.instruments.join(', ') })
      case 'unsupported':
        return t('preferences.midiStatus.unsupported')
      case 'denied':
        return t('preferences.midiStatus.denied')
      default:
        return null
    }
  })

  return { status, line }
}
