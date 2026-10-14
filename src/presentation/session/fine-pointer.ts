import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

// A desktop is told by a main pointer that is fine, a mouse or a touchpad; a browser that cannot
// tell is taken for a phone. A mouse plugged in or taken away is followed.
export function useFinePointer() {
  const query =
    typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: fine)') : null
  const fine = ref(query?.matches ?? false)
  const update = () => {
    fine.value = query?.matches ?? false
  }

  onMounted(() => query?.addEventListener('change', update))
  onBeforeUnmount(() => query?.removeEventListener('change', update))
  return readonly(fine)
}
