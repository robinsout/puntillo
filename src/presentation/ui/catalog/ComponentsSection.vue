<script setup lang="ts">
import { ref, useId } from 'vue'
import { UiCheckbox, UiSection, UiSelect } from '@/presentation/ui'

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

.description {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
