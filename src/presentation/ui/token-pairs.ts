export interface TokenPair {
  readonly foreground: string
  readonly background: string
  readonly large: boolean
}

export const AA_NORMAL = 4.5
export const AA_LARGE = 3

const BACKGROUNDS = ['--color-ground', '--color-surface', '--color-surface-sunken']
const TEXTS = [
  '--color-text',
  '--color-text-soft',
  '--color-text-muted',
  '--color-accent',
  '--color-correct',
  '--color-wrong',
]

const pair = (foreground: string, background: string): TokenPair => ({
  foreground,
  background,
  large: false,
})

export const TOKEN_PAIRS: readonly TokenPair[] = [
  ...TEXTS.flatMap((foreground) => BACKGROUNDS.map((background) => pair(foreground, background))),
  pair('--color-correct', '--color-correct-tint'),
  pair('--color-wrong', '--color-wrong-tint'),
  pair('--color-accent', '--color-accent-tint'),
  pair('--color-on-accent', '--color-accent'),
  // A pressed toggle button inverts the colours.
  pair('--color-surface', '--color-text'),
  // The note heard is drawn on the staff, over any background.
  ...BACKGROUNDS.map((background) => pair('--color-heard', background)),
]
