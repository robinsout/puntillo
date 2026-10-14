<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useSessionStore } from '@/presentation/session'
import { UiAppBar, UiNavBar, type IconName } from '@/presentation/ui'
import { sectionOf, type Section } from './section-of'

const { t } = useI18n()
const route = useRoute()
const session = useSessionStore()

const SECTIONS: readonly { section: Section & IconName; to: string; label: string }[] = [
  { section: 'trainer', to: '/', label: 'wiki.trainer' },
  { section: 'progress', to: '/progress', label: 'progress.title' },
  { section: 'wiki', to: '/wiki', label: 'wiki.title' },
  { section: 'settings', to: '/settings', label: 'settings.title' },
]

const current = computed(() => sectionOf(route.path))

// The question asks for the whole screen; Finish is its one way out.
const shown = computed(() => {
  const asking = session.state.phase === 'question' || session.state.phase === 'writing'
  return current.value !== null && !(current.value === 'trainer' && asking)
})

const items = computed(() =>
  SECTIONS.map(({ section, to, label }) => ({
    to,
    label: t(label),
    icon: section,
    current: section === current.value,
  })),
)
</script>

<template>
  <UiAppBar v-if="shown" title="Puntillo" to="/">
    <UiNavBar :label="t('navigation.sections')" :items="items" />
  </UiAppBar>
  <div :class="{ 'clear-of-tabs': shown }">
    <slot />
  </div>
</template>

<style scoped>
/* The tabs are fixed over the bottom of the page, so its end scrolls up above them. */
@media (width < 768px) {
  .clear-of-tabs {
    padding-bottom: calc(var(--target-size-tab) + env(safe-area-inset-bottom));
  }
}
</style>
