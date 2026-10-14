export type Section = 'trainer' | 'progress' | 'wiki' | 'settings'

const PREFIXES: readonly (readonly [string, Section])[] = [
  ['/progress', 'progress'],
  ['/wiki', 'wiki'],
  ['/settings', 'settings'],
]

export function sectionOf(path: string): Section | null {
  if (path === '/') return 'trainer'
  const found = PREFIXES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
  return found ? found[1] : null
}
