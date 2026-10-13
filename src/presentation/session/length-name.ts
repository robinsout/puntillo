import { useI18n } from 'vue-i18n'
import type { SessionLength } from '@/domain/session'

// A length as the choice screen names it: "20", "5 min", "No limit".
export function useLengthName() {
  const { t } = useI18n()
  return (length: SessionLength): string => {
    if (length === 'unlimited') return t('session.unlimited')
    if (typeof length === 'number') return String(length)
    return t('session.minutes', { minutes: length.minutes })
  }
}
