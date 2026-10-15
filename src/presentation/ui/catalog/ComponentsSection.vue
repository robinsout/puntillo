<script setup lang="ts">
import { ref, useId } from 'vue'
import {
  UiAnswerKey,
  UiAppBar,
  UiButton,
  UiCheckbox,
  UiChoiceCard,
  UiIcon,
  UiNavBar,
  UiOptionGrid,
  UiProgress,
  UiSection,
  UiSegmented,
  UiSelect,
  UiStat,
  UiTextField,
  UiLinkList,
  UiList,
  UiDialog,
  UiDisclosure,
  UiIconButton,
  UiLogo,
} from '@/presentation/ui'

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

const BOUNDS = [
  { value: 'do4', label: 'do4' },
  { value: 'sol4', label: 'sol4' },
  { value: 'do5', label: 'do5 — Too few notes', disabled: true },
] as const
const bound = ref<(typeof BOUNDS)[number]['value']>('do4')

const LENGTHS = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
  { value: 'unlimited', label: 'No limit', display: '∞' },
  { value: '3min', label: '3 min' },
  { value: '5min', label: '5 min' },
  { value: '10min', label: '10 min' },
] as const
const length = ref<(typeof LENGTHS)[number]['value']>('10')

const QUESTION_LENGTHS = [
  { value: 'one-note', label: 'One note' },
  { value: 'one-bar', label: 'One bar' },
  {
    value: 'two-bars',
    label: 'Two bars',
    disabled: true,
    description: "Doesn't fit the time signature",
  },
] as const
const questionLength = ref<(typeof QUESTION_LENGTHS)[number]['value']>('one-note')

const EXERCISES = [
  { value: 'read', label: 'Read notes' },
  { value: 'write', label: 'Write notes' },
] as const
const exercise = ref<(typeof EXERCISES)[number]['value']>('read')

const LEDGER_LINES = [
  { value: 0, label: 'None', disabled: true, description: 'Too few notes' },
  { value: 1, label: 'Up to one' },
  { value: 2, label: 'Up to two' },
] as const
const ledgerLines = ref<(typeof LEDGER_LINES)[number]['value']>(1)

const centerOpen = ref(false)
const sheetOpen = ref(false)
const shownExpanded = ref(true)
const shownCollapsed = ref(false)

const LEVELS = [
  { value: 'first', title: 'First steps', description: 'C4–C5 · one note' },
  { value: 'confident', title: 'Confident reading', description: 'C4–G5 · one bar' },
] as const
const level = ref<(typeof LEVELS)[number]['value']>('first')

const KEYS = [
  { name: 'do', pressed: false, mark: null, disabled: false, state: 'plain' },
  { name: 're', pressed: true, mark: null, disabled: false, state: 'pressed' },
  { name: 'mi', pressed: false, mark: null, disabled: true, state: 'disabled' },
  { name: 'fa', pressed: false, mark: 'correct', disabled: true, state: 'correct' },
  { name: 'sol', pressed: true, mark: 'wrong', disabled: true, state: 'wrong' },
  { name: 'la', pressed: false, mark: 'rejected', disabled: true, state: 'rejected' },
] as const
const pressedKey = ref<string>('re')

const searched = ref('')

const TOPICS = [
  { to: '/wiki/treble-staff', label: 'Notes on the treble staff' },
  { to: '/wiki/accidentals', label: 'Sharp, flat and natural' },
  { to: '/wiki/key-signatures', label: 'Key signatures' },
] as const

const ICONS = [
  'trainer',
  'progress',
  'wiki',
  'settings',
  'check',
  'close',
  'cross',
  'chevron',
  'back',
] as const
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
    <p class="description">
      Stacked, a help in its slot aside, the last option unavailable with its reason in its text.
    </p>
    <div class="narrow">
      <UiSelect v-model="bound" label="To" :options="BOUNDS" stacked>
        <template #aside><UiIconButton label="Help: To">?</UiIconButton></template>
      </UiSelect>
    </div>

    <h3><code>UiButton</code></h3>
    <div class="row">
      <UiButton variant="primary">Primary</UiButton>
      <UiButton>Secondary</UiButton>
      <UiButton variant="quiet">Quiet</UiButton>
      <UiButton disabled>Disabled</UiButton>
    </div>
    <UiButton variant="primary" size="l" block>Primary, large, block</UiButton>

    <h3><code>UiOptionGrid</code></h3>
    <p class="description">
      One option chosen; Tab into the group and use the arrows to see the focus.
    </p>
    <UiOptionGrid
      v-model="length"
      label="Session length"
      name="catalog-length"
      :options="LENGTHS"
    />
    <p class="description">One column; the last option unavailable, its reason below it.</p>
    <UiOptionGrid
      v-model="questionLength"
      label="Question length"
      name="catalog-question-length"
      :options="QUESTION_LENGTHS"
      :columns="1"
    />

    <h3><code>UiSegmented</code></h3>
    <p class="description">
      Its label Exercise is for screen readers only; Tab into it and use the arrows to see the
      focus.
    </p>
    <UiSegmented v-model="exercise" label="Exercise" name="catalog-exercise" :options="EXERCISES" />
    <p class="description">The first option unavailable, its reason below its segment.</p>
    <UiSegmented
      v-model="ledgerLines"
      label="Ledger lines"
      name="catalog-ledger-lines"
      :options="LEDGER_LINES"
    />

    <h3><code>UiChoiceCard</code></h3>
    <p class="description">
      The first chosen, the second not; the media slot holds a staff on the start screen, a box
      here.
    </p>
    <div class="cards">
      <UiChoiceCard
        v-for="each in LEVELS"
        :key="each.value"
        :pressed="level === each.value"
        :title="each.title"
        :description="each.description"
        @click="level = each.value"
      >
        <template #media><span class="media" /></template>
      </UiChoiceCard>
    </div>

    <h3><code>UiProgress</code></h3>
    <UiProgress :value="3" :max="10" label="Question 3 of 10" />
    <UiProgress :value="10" :max="10" label="Question 10 of 10" />

    <h3><code>UiAnswerKey</code></h3>
    <p class="description">
      Plain, pressed and disabled; after a check correct, wrong and rejected on the first attempt.
      The first two take a press.
    </p>
    <ul class="keys">
      <li v-for="key in KEYS" :key="key.name">
        <UiAnswerKey
          :pressed="key.disabled ? key.pressed : pressedKey === key.name"
          :mark="key.mark"
          :disabled="key.disabled"
          @click="pressedKey = key.name"
        >
          {{ key.name }}
        </UiAnswerKey>
        <span class="description">{{ key.state }}</span>
      </li>
    </ul>

    <h3><code>UiStat</code></h3>
    <p class="description">Tiles of a list of descriptions; the last value comes from the slot.</p>
    <dl class="stats">
      <UiStat label="Questions" :value="10" />
      <UiStat label="Best streak" value="5" />
      <UiStat label="Average time">2.4&nbsp;s</UiStat>
    </dl>

    <h3><code>UiTextField</code></h3>
    <UiTextField v-model="searched" label="Search" type="search" />

    <h3><code>UiList</code></h3>
    <UiList>
      <li class="line">13 Oct · Read notes · 20 questions</li>
      <li class="line">12 Oct · Write notes · 5 min · 12 questions</li>
    </UiList>

    <h3><code>UiLinkList</code></h3>
    <p class="description">Hover a line to see its ground; Tab to a link to see its focus.</p>
    <UiLinkList :items="TOPICS" />

    <h3><code>UiSection</code></h3>
    <UiSection title="Write notes">
      <UiCheckbox :model-value="false">Show note names on the staff</UiCheckbox>
    </UiSection>

    <h3><code>UiDialog</code></h3>
    <p class="description">
      Modal: the focus stays inside, Esc or a press on the backdrop closes it. The sheet comes from
      the bottom below 768 px and stands at the right from 768 px.
    </p>
    <div class="row">
      <UiButton @click="centerOpen = true">Open a dialog</UiButton>
      <UiButton @click="sheetOpen = true">Open a sheet</UiButton>
    </div>
    <UiDialog v-model:open="centerOpen" title="Keyboard shortcuts">
      <p class="text">Note names: <kbd class="ui-kbd">A</kbd> … <kbd class="ui-kbd">J</kbd></p>
      <template #actions>
        <UiButton @click="centerOpen = false">Close</UiButton>
      </template>
    </UiDialog>
    <UiDialog v-model:open="sheetOpen" title="Customize" variant="sheet">
      <p class="text">The values scroll; the actions stay at the bottom.</p>
      <template #actions>
        <UiButton variant="primary" block @click="sheetOpen = false">Done</UiButton>
      </template>
    </UiDialog>

    <h3><code>UiDisclosure</code></h3>
    <p class="description">Expanded and collapsed; the chevron turns with the state.</p>
    <UiDisclosure v-model="shownExpanded" title="Pitch">
      <UiCheckbox :model-value="true">A value of the group</UiCheckbox>
    </UiDisclosure>
    <UiDisclosure v-model="shownCollapsed" title="Rhythm">
      <UiCheckbox :model-value="false">A value of the group</UiCheckbox>
    </UiDisclosure>

    <h3><code>UiIconButton</code></h3>
    <p class="description">Named by its label, not by its sign; Tab to it to see its focus.</p>
    <div class="row">
      <UiIconButton label="Help: Ledger lines">?</UiIconButton>
      <UiIconButton label="Close"><UiIcon name="close" /></UiIconButton>
    </div>

    <h3><code>UiIcon</code></h3>
    <ul class="icons">
      <li v-for="icon in ICONS" :key="icon"><UiIcon :name="icon" /> {{ icon }}</li>
    </ul>

    <h3><code>UiLogo</code></h3>
    <p class="description">
      The sign of the app, as in the favicon; it takes the size of the text around it.
    </p>
    <UiLogo />

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

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
}

.cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.media {
  display: block;
  height: var(--target-size);
  border-radius: var(--radius-s);
  background: var(--color-surface-sunken);
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-s);
  margin: 0;
}

.keys {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(2 * var(--target-size)), 1fr));
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  list-style: none;
}

.keys li {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
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

.line {
  padding: var(--space-s) var(--space-m);
}

.narrow {
  max-width: calc(4 * var(--target-size));
}

.text {
  margin: 0;
}

.description {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
