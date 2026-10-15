<script setup lang="ts">
import { useId } from 'vue'
import { PRESETS } from '@/domain/difficulty'
import { StaffView } from '@/infrastructure/notation'
import { PRESET_EXAMPLE_SCALE } from '@/presentation/preferences/preset-example-source'
import { PRESET_EXAMPLES } from '@/presentation/preferences/preset-examples'

// npm run render:examples takes the drawings of the cards of the presets from these staves.

const headingId = useId()
</script>

<template>
  <section :aria-labelledby="headingId">
    <h2 :id="headingId">Preset examples</h2>
    <p class="description">
      The staves the drawings on the cards of the presets are made from, as wide as on a card.
    </p>
    <dl class="examples">
      <div v-for="preset in PRESETS" :key="preset" class="example">
        <dt>
          <code>{{ preset }}</code>
        </dt>
        <dd :data-preset="preset">
          <StaffView
            :question="PRESET_EXAMPLES[preset]"
            label="Example"
            :drawing-scale="PRESET_EXAMPLE_SCALE"
            single-line
          />
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.description {
  color: var(--color-text-muted);
}

.examples {
  display: grid;
  gap: var(--space-s);
  margin: 0;
}

.example {
  display: flex;
  align-items: center;
  gap: var(--space-m);
}

dd {
  width: var(--width-example);
  margin: 0;
}
</style>
