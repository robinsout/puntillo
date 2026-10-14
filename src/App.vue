<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useKeySound, useMidiInput } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'

// Browsers let sound start only from a gesture, and the samples load on the first one.
const keySound = useKeySound()
// Clearing the box of the sound is a press as well, and must not load the samples it turns off.
const prepare = (event: Event) => {
  if (event.target instanceof Element && event.target.closest('[data-sound-switch]')) return
  keySound.prepare()
}
const EVENTS = ['pointerdown', 'keydown'] as const
onMounted(() => EVENTS.forEach((event) => document.addEventListener(event, prepare, true)))

// Ticked before: the instrument is heard again without ticking the box anew.
const midiInput = useMidiInput()
const preferences = usePreferencesStore()
onMounted(() => {
  if (preferences.useMidi) midiInput.connect()
})
onBeforeUnmount(() => EVENTS.forEach((event) => document.removeEventListener(event, prepare, true)))
</script>

<template>
  <RouterView />
</template>
