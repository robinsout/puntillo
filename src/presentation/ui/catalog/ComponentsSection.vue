<script setup lang="ts">
import { ref, useId } from 'vue'
import { UiAppBar, UiCheckbox, UiIcon, UiNavBar, UiSection, UiSelect } from '@/presentation/ui'

const headingId = useId()
const descriptionId = useId()

const unticked = ref(false)
const ticked = ref(true)
const described = ref(false)

const OPTIONS = [
  { value: 'names', label: 'Note names' },
  { value: 'keyboard', label: 'Piano keyboard' },
] as const
const chosen = ref<(typeof OPTIONS)[number]['value']>('names')

const ICONS = ['trainer', 'progress', 'wiki', 'settings'] as const
const SECTIONS = [
  { to: '/', label: 'Trainer', icon: 'trainer', current: false },
  { to: '/progress', label: 'Progress', icon: 'progress', current: false },
  { to: '/wiki', label: 'Wiki', icon: 'wiki', current: true },
  { to: '/settings', label: 'Settings', icon: 'settings', current: false },
] as const
</script>

<template>
  <section class="components" :aria-labelledby="headingId">
    <h2 :id="headingId">Components</h2>

    <h3><code>UiCheckbox</code></h3>
    <UiCheckbox v-model="unticked">Unticked</UiCheckbox>
    <UiCheckbox v-model="ticked">Ticked</UiCheckbox>
    <UiCheckbox :model-value="false" disabled>Disabled</UiCheckbox>
    <UiCheckbox v-model="described" :aria-describedby="descriptionId"
      >With a description</UiCheckbox
    >
    <p :id="descriptionId" class="description">A line that tells more about the box.</p>

    <h3><code>UiSelect</code></h3>
    <UiSelect v-model="chosen" label="Note input" :options="OPTIONS" />

    <h3><code>UiSection</code></h3>
    <UiSection title="Write notes">
      <UiCheckbox :model-value="false">Show note names on the staff</UiCheckbox>
    </UiSection>

    <h3><code>UiIcon</code></h3>
    <ul class="icons">
      <li v-for="icon in ICONS" :key="icon"><UiIcon :name="icon" /> {{ icon }}</li>
    </ul>

    <h3><code>UiAppBar</code> with <code>UiNavBar</code></h3>
    <p class="description">
      Wiki is the current section, the others ordinary; Tab to a link to see its focus. Below 768 px
      the navigation is a bar of tabs at the bottom of this frame.
    </p>
    <div class="frame">
      <UiAppBar title="Puntillo" to="/">
        <UiNavBar label="Sections" :items="SECTIONS" />
      </UiAppBar>
    </div>
  </section>
</template>

<style scoped>
.components {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

h3 {
  margin: var(--space-m) 0 0;
}

.icons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-m);
  margin: 0;
  padding: 0;
  list-style: none;
}

.icons li {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

/* Layout containment holds the fixed tab bar inside the frame instead of the page. */
.frame {
  contain: layout;
  border: var(--line-thin) solid var(--color-line);
}

@media (width < 768px) {
  .frame {
    padding-bottom: var(--target-size-tab);
  }
}

.description {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
