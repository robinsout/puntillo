import { describe, expect, it } from 'vitest'
import { appRoutes } from '@/presentation/router'

// Feature design-system, slice 1, criterion 5: the catalog of the design system is a page of the
// dev build only.

const paths = (catalog: boolean) => appRoutes({ catalog }).map((route) => route.path)

describe('appRoutes', () => {
  it('has the catalog at /design-system when asked for it', () => {
    expect(paths(true)).toContain('/design-system')
  })

  it('leaves the catalog out otherwise', () => {
    expect(paths(false)).not.toContain('/design-system')
  })

  it('keeps the screens of the app either way', () => {
    for (const catalog of [true, false]) {
      expect(paths(catalog)).toEqual(expect.arrayContaining(['/', '/progress', '/wiki']))
    }
  })
})
