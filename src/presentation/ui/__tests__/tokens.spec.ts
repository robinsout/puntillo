import { describe, expect, it } from 'vitest'
import tokensCss from '@/presentation/ui/tokens.css?raw'
import { contrastRatio } from '@/presentation/ui/contrast'
import { AA_LARGE, AA_NORMAL, TOKEN_PAIRS } from '@/presentation/ui/token-pairs'
import { readTokens } from '@/presentation/ui/tokens'

// Feature design-system, slice 1, criteria 1 and 7: every value of the design is a token of
// tokens.css, palette A, and the tokens used together pass AA.

describe('readTokens', () => {
  const css = `
    /* The palette. */
    :root {
      --color-ground:   #f7f2e7;   /* page background */
      --font-body: 'Source Sans 3', system-ui, sans-serif;
      /* --color-commented: #000000; */
      --space-m:1rem;
      color-scheme: light;
    }
  `

  it('reads the custom properties in the order they are declared', () => {
    expect([...readTokens(css).keys()]).toEqual(['--color-ground', '--font-body', '--space-m'])
  })

  it('reads the values without the spaces around them', () => {
    const tokens = readTokens(css)

    expect(tokens.get('--color-ground')).toBe('#f7f2e7')
    expect(tokens.get('--font-body')).toBe("'Source Sans 3', system-ui, sans-serif")
    expect(tokens.get('--space-m')).toBe('1rem')
  })

  it('skips what is commented out', () => {
    expect(readTokens(css).has('--color-commented')).toBe(false)
  })
})

const PALETTE_A = {
  '--color-ground': '#f7f2e7',
  '--color-surface': '#fffdf8',
  '--color-surface-sunken': '#ede5d3',
  '--color-text': '#22201c',
  '--color-text-soft': '#4a443c',
  '--color-text-muted': '#6b6358',
  '--color-line': '#e4dccb',
  '--color-border': '#8a7f6c',
  '--color-accent': '#8c2f39',
  '--color-accent-hover': '#6e222b',
  '--color-accent-tint': '#f4e6e2',
  '--color-on-accent': '#fffdf8',
  '--color-correct': '#1d4e89',
  '--color-correct-tint': '#e8eff8',
  '--color-wrong': '#a4470f',
  '--color-wrong-tint': '#fbede3',
  '--color-focus': '#1d4e89',
  '--color-scrim': 'rgb(34 32 28 / 40%)',
}

const SCALES = {
  '--font-body': "'Source Sans 3', system-ui, sans-serif",
  '--font-display': "'Source Serif 4', Georgia, serif",
  '--font-weight-regular': '400',
  '--font-weight-semibold': '600',
  '--font-weight-bold': '700',
  '--font-size-xs': '0.8125rem',
  '--font-size-s': '0.875rem',
  '--font-size-m': '1rem',
  '--font-size-l': '1.1875rem',
  '--font-size-xl': '1.5rem',
  '--font-size-xxl': '2rem',
  '--font-size-display': '4rem',
  '--line-height': '1.45',
  '--line-height-tight': '1.15',
  '--space-xs': '0.25rem',
  '--space-s': '0.5rem',
  '--space-m': '1rem',
  '--space-l': '1.5rem',
  '--space-xl': '2rem',
  '--radius-s': '0.375rem',
  '--radius-m': '0.625rem',
  '--radius-l': '0.875rem',
  '--radius-pill': '999px',
  '--line-thin': '1px',
  '--line-medium': '2px',
  '--line-thick': '3px',
  '--target-size': '2.75rem',
  '--target-size-l': '3.25rem',
  '--width-content': '40rem',
  '--width-dialog': '32rem',
  // Feature design-system, slice 2: the column of the question screen.
  '--width-wide': '62.5rem',
  '--shadow-raised': '0 1px 2px rgb(60 40 20 / 15%)',
  '--opacity-disabled': '0.5',
}

const BACKGROUNDS = ['--color-ground', '--color-surface', '--color-surface-sunken']
const TEXTS = [
  '--color-text',
  '--color-text-soft',
  '--color-text-muted',
  '--color-accent',
  '--color-correct',
  '--color-wrong',
]
const PAIRS_IN_USE = [
  ...TEXTS.flatMap((foreground) => BACKGROUNDS.map((background) => ({ foreground, background }))),
  { foreground: '--color-correct', background: '--color-correct-tint' },
  { foreground: '--color-wrong', background: '--color-wrong-tint' },
  { foreground: '--color-accent', background: '--color-accent-tint' },
  { foreground: '--color-on-accent', background: '--color-accent' },
  // The pressed toggle button: aria-pressed inverts the colours.
  { foreground: '--color-surface', background: '--color-text' },
]

describe('tokens.css', () => {
  const tokens = readTokens(tokensCss)

  it.each(Object.entries({ ...PALETTE_A, ...SCALES }))('sets %s to %s', (name, value) => {
    expect(tokens.get(name)?.toLowerCase()).toBe(value.toLowerCase())
  })

  it.each(PAIRS_IN_USE)('pairs $foreground on $background', (pair) => {
    expect(
      TOKEN_PAIRS.some(
        ({ foreground, background }) =>
          foreground === pair.foreground && background === pair.background,
      ),
    ).toBe(true)
  })

  it.each(TOKEN_PAIRS)('passes AA with $foreground on $background', (pair) => {
    const foreground = tokens.get(pair.foreground)
    const background = tokens.get(pair.background)
    expect(foreground).toBeDefined()
    expect(background).toBeDefined()

    const ratio = contrastRatio(foreground ?? '', background ?? '')

    expect(ratio).toBeGreaterThanOrEqual(pair.large ? AA_LARGE : AA_NORMAL)
  })

  it('takes AA as 4.5:1 for text and 3:1 for large text', () => {
    expect(AA_NORMAL).toBe(4.5)
    expect(AA_LARGE).toBe(3)
  })
})
