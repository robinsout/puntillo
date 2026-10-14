<script setup lang="ts">
import { useId, type StyleValue } from 'vue'

defineProps<{
  title: string
  tokens: readonly (readonly [string, string])[]
  sample: (token: string) => StyleValue
  sampleText?: string
}>()

const headingId = useId()
</script>

<template>
  <section :aria-labelledby="headingId">
    <h2 :id="headingId">{{ title }}</h2>
    <dl class="tokens">
      <div v-for="[name, value] in tokens" :key="name" class="token">
        <dt>
          <code>{{ name }}</code>
        </dt>
        <dd>
          <code>{{ value }}</code>
        </dd>
        <dd :class="['sample', `sample-${title.toLowerCase()}`]" :style="sample(name)">
          {{ sampleText }}
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.tokens {
  display: grid;
  gap: var(--space-s);
  margin: 0;
}

.token {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-xs) var(--space-m);
  align-items: center;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.sample {
  grid-column: 1 / -1;
}

.sample-colors {
  height: var(--target-size);
  border: var(--line-thin) solid var(--color-line);
  border-radius: var(--radius-s);
}

.sample-spacing {
  max-width: 100%;
  height: var(--space-s);
  background: var(--color-accent);
}

.sample-radii {
  width: var(--target-size-l);
  height: var(--target-size-l);
  border: var(--line-medium) solid var(--color-border);
  background: var(--color-surface);
}

/* Each line sets its own width of the top border. */
.sample-lines {
  height: var(--target-size);
  border-top: 0 solid var(--color-text);
  background: var(--color-surface);
}
</style>
