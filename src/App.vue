<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
/* VexFlow draws the staff in black, so the theme is light-only. */
:root {
  color-scheme: light;
  --space-s: 0.5rem;
  --space-m: 1rem;
  --radius: 0.5rem;
  /* Spec: interactive targets are at least 44×44 CSS px. */
  --target-size: 2.75rem;
  --color-text: #1f2328;
  --color-surface: #ffffff;
  --color-border: #8c959f;
  --color-accent: #0969da;
  --color-on-accent: #ffffff;
  --color-focus: #0969da;
  --color-success: #1a7f37;
  --color-danger: #cf222e;
  --opacity-disabled: 0.5;

  font-family: system-ui, sans-serif;
  line-height: 1.5;
  color: var(--color-text);
  background: var(--color-surface);
}

body {
  margin: 0;
}

.screen {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  max-width: 40rem;
  margin-inline: auto;
  padding-block: max(var(--space-m), env(safe-area-inset-top))
    max(var(--space-m), env(safe-area-inset-bottom));
  padding-inline: max(var(--space-m), env(safe-area-inset-left))
    max(var(--space-m), env(safe-area-inset-right));
}

.screen > h1,
.screen > p {
  margin: 0;
}

/* Headings get focus programmatically on screen change, so no focus ring. */
h1[tabindex='-1']:focus {
  outline: none;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

button,
select {
  min-width: var(--target-size);
  min-height: var(--target-size);
  padding-inline: var(--space-s);
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

/* WebKit ignores min-height on a select; its button form takes an explicit height. */
select {
  appearance: menulist-button;
  height: var(--target-size);
}

button:focus-visible,
select:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.primary {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-weight: 700;
}
</style>
