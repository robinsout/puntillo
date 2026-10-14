import { describe, expect, it } from 'vitest'
import { sectionOf } from '@/presentation/shell/section-of'

// Feature navigation-and-settings, slice 2, criterion 1: the section of the address is the one
// the navigation marks current, nested addresses included.

describe('sectionOf', () => {
  it.each([
    ['/', 'trainer'],
    ['/progress', 'progress'],
    ['/wiki', 'wiki'],
    ['/wiki/keys', 'wiki'],
    ['/wiki/durations', 'wiki'],
    ['/settings', 'settings'],
  ] as const)('takes %s for the section %s', (path, section) => {
    expect(sectionOf(path)).toBe(section)
  })

  it.each(['/design-system', '/unknown', '/wikipedia', '/progressive'])(
    'takes %s for no section',
    (path) => {
      expect(sectionOf(path)).toBeNull()
    },
  )
})
