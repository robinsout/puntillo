<template>
  <main class="screen question-main">
    <slot />
  </main>
</template>

<style scoped>
/* The question takes a wider column than the other screens, room for the staff and the keys. */
.question-main {
  max-width: var(--width-wide);
}

/* At least the window high, so that the action stands at its bottom (QuestionAction). */
@media (width < 768px) and (orientation: portrait) {
  .question-main {
    box-sizing: border-box;
    min-height: 100dvh;
  }
}
</style>
