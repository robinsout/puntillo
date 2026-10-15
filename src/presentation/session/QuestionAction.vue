<!-- The main action of a question, Check, Next or Results; until it is offered, an empty cell keeps
     its place. -->
<template>
  <div class="question-action">
    <slot><span class="placeholder" /></slot>
  </div>
</template>

<style scoped>
.placeholder {
  display: block;
  min-height: var(--target-size-l);
}

/* On a phone the action stands at the bottom of the window: at the end of a short screen, stuck
   to the bottom edge over a long one, and in its place once the page is scrolled to its end. A
   phone held sideways is too low for that: stuck, the action would cover the staff. */
@media (width < 768px) and (orientation: portrait) {
  .question-action {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding-block: var(--space-s) max(var(--space-s), env(safe-area-inset-bottom));
    background: var(--color-ground);
  }
}

@media (width >= 768px) {
  .question-action {
    width: min(100%, var(--width-panel));
  }
}
</style>
