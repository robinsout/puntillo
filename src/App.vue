<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
/* Токены темы. Нотоносец VexFlow рисуется чёрным, поэтому тема только светлая. */
:root {
  color-scheme: light;
  --space-s: 0.5rem;
  --space-m: 1rem;
  --radius: 0.5rem;
  /* ТЗ: интерактивные элементы не меньше 44×44 CSS-пикселей. */
  --target-size: 2.75rem;
  --color-text: #1f2328;
  --color-surface: #ffffff;
  --color-border: #8c959f;
  --color-accent: #0969da;
  --color-on-accent: #ffffff;
  --color-focus: #0969da;
  --color-success: #1a7f37;
  --color-danger: #cf222e;

  font-family: system-ui, sans-serif;
  line-height: 1.5;
  color: var(--color-text);
  background: var(--color-surface);
}

body {
  margin: 0;
}
</style>
