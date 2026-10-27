import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMicrophone } from '@/presentation/dependencies'
import { useDeviceStatus } from './device-status'

// The state of the microphone, heard only while active, and the line that tells it; none while
// the browser has not been asked or has not answered. A problem keeps the microphone from being
// used at all.
export function useMicrophoneStatus(active: () => boolean) {
  const { t } = useI18n()
  const status = useDeviceStatus(useMicrophone(), active)

  const problem = computed(() => {
    const { kind } = status.value
    return kind === 'denied' || kind === 'missing' || kind === 'unsupported'
  })

  const line = computed(() => {
    const { kind } = status.value
    if (kind === 'ready') return t('preferences.microphoneStatus.listening')
    return problem.value ? t(`preferences.microphoneStatus.${kind}`) : null
  })

  return { problem, line }
}
