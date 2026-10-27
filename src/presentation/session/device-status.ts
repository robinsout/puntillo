import { onScopeDispose, shallowRef, watch, type ShallowRef } from 'vue'

interface StatusSource<S> {
  status(): S
  onStatus(listener: (status: S) => void): () => void
}

// The state of a device, heard only while active.
export function useDeviceStatus<S>(source: StatusSource<S>, active: () => boolean): ShallowRef<S> {
  const status = shallowRef<S>(source.status())

  let stop = () => {}
  watch(
    active,
    (on) => {
      stop()
      stop = () => {}
      if (!on) return
      status.value = source.status()
      stop = source.onStatus((next) => (status.value = next))
    },
    { immediate: true },
  )
  onScopeDispose(() => stop())

  return status
}
