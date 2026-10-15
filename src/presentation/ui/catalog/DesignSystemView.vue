<script setup lang="ts">
import type { StyleValue } from 'vue'
import tokensCss from '@/presentation/ui/tokens.css?raw'
import { contrastRatio } from '@/presentation/ui/contrast'
import { AA_LARGE, AA_NORMAL, TOKEN_PAIRS } from '@/presentation/ui/token-pairs'
import { readTokens } from '@/presentation/ui/tokens'
import ComponentsSection from './ComponentsSection.vue'
import PresetExamplesSection from './PresetExamplesSection.vue'
import TokenSection from './TokenSection.vue'

// A tool for developers, not part of the app: its texts are English only and stay out of i18n.

interface Section {
  readonly title: string
  readonly matches: RegExp
  readonly sample: (token: string) => StyleValue
  readonly sampleText?: string
}

const TYPE_PROPERTIES: readonly (readonly [RegExp, string])[] = [
  [/^--font-size-/, 'font-size'],
  [/^--font-weight-/, 'font-weight'],
  [/^--font-/, 'font-family'],
  [/^--line-height/, 'line-height'],
]

const typeSample = (token: string): StyleValue => {
  const property = TYPE_PROPERTIES.find(([matches]) => matches.test(token))?.[1]
  return property ? { [property]: `var(${token})` } : {}
}

const linesSample = (token: string): StyleValue => {
  if (token.startsWith('--shadow-')) return { boxShadow: `var(${token})` }
  if (token.startsWith('--opacity-')) return { opacity: `var(${token})` }
  return { borderTopWidth: `var(${token})` }
}

const COLORS: Section = {
  title: 'Colors',
  matches: /^--color-/,
  sample: (token) => ({ background: `var(${token})` }),
}

const OTHERS: readonly Section[] = [
  {
    title: 'Type',
    matches: /^--(font-|line-height)/,
    sample: typeSample,
    sampleText: 'Sight-reading trainer',
  },
  {
    title: 'Spacing',
    matches: /^--(space-|target-size|icon-size|width-)/,
    sample: (token) => ({ width: `var(${token})` }),
  },
  { title: 'Radii', matches: /^--radius-/, sample: (token) => ({ borderRadius: `var(${token})` }) },
  { title: 'Lines', matches: /^--(line-(?!height)|shadow-|opacity-)/, sample: linesSample },
  { title: 'Motion', matches: /^--duration-/, sample: () => ({}) },
]

const tokens = readTokens(tokensCss)

const withTokens = ({ matches, ...section }: Section) => ({
  ...section,
  tokens: [...tokens].filter(([name]) => matches.test(name)),
})
const colors = withTokens(COLORS)
const others = OTHERS.map(withTokens)

const pairs = TOKEN_PAIRS.map((pair) => {
  const ratio = contrastRatio(tokens.get(pair.foreground) ?? '', tokens.get(pair.background) ?? '')
  return {
    ...pair,
    ratio: `${ratio.toFixed(1)}:1`,
    passes: ratio >= (pair.large ? AA_LARGE : AA_NORMAL),
  }
})
</script>

<template>
  <main class="screen">
    <h1>Design system</h1>

    <TokenSection v-bind="colors" />

    <section aria-labelledby="catalog-contrast">
      <h2 id="catalog-contrast">Contrast</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Pair</th>
            <th scope="col">Sample</th>
            <th scope="col">Ratio</th>
            <th scope="col">WCAG</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pair in pairs" :key="`${pair.foreground} ${pair.background}`">
            <th scope="row">
              <code>{{ pair.foreground }}</code> on <code>{{ pair.background }}</code>
            </th>
            <td
              class="pair-sample"
              :style="{ color: `var(${pair.foreground})`, background: `var(${pair.background})` }"
            >
              Aa
            </td>
            <td>{{ pair.ratio }}</td>
            <td>{{ pair.passes ? 'AA' : 'fails' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <TokenSection v-for="section in others" :key="section.title" v-bind="section" />

    <ComponentsSection />

    <PresetExamplesSection />
  </main>
</template>

<style scoped>
table {
  border-collapse: collapse;
}

th,
td {
  padding: var(--space-xs) var(--space-s);
  border-bottom: var(--line-thin) solid var(--color-line);
  overflow-wrap: anywhere;
  text-align: start;
}

.pair-sample {
  font-weight: var(--font-weight-bold);
}
</style>
