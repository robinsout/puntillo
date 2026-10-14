// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import stylelint from 'stylelint'

// Feature design-system, slice 1, criterion 4: the style linter turns down a colour or a size past
// the tokens anywhere in src but in tokens.css, the one file of values.

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const configFile = `${root}stylelint.config.mjs`
const COMPONENT = `${root}src/presentation/x/Foo.vue`
const TOKENS = `${root}src/presentation/ui/tokens.css`

const component = (declaration: string, wrap = (rule: string) => rule) =>
  `<template>\n  <p class="foo">Foo</p>\n</template>\n\n<style scoped>\n${wrap(
    `.foo {\n  ${declaration};\n}`,
  )}\n</style>\n`

async function warningsOf(code: string, codeFilename: string) {
  const { results } = await stylelint.lint({ code, codeFilename, configFile, cwd: root })
  return results.flatMap((result) => result.warnings.map((warning) => warning.rule))
}

describe('the style linter in a component', () => {
  it.each([
    ['a hex colour', 'color: #8c2f39', 'color-no-hex'],
    ['a colour function', 'color: rgb(140 47 57)', 'function-disallowed-list'],
    ['a named colour', 'color: red', 'color-named'],
    ['a size in px', 'padding: 10px', 'unit-disallowed-list'],
  ])('turns down %s', async (_, declaration, rule) => {
    expect(await warningsOf(component(declaration), COMPONENT)).toContain(rule)
  })

  it.each([
    ['a token', 'padding: var(--space-m)'],
    ['a zero', 'margin: 0'],
  ])('lets %s through', async (_, declaration) => {
    expect(await warningsOf(component(declaration), COMPONENT)).toEqual([])
  })

  it('lets px through in a media query on the width', async () => {
    const code = component(
      'padding: var(--space-m)',
      (rule) => `@media (width >= 768px) {\n  ${rule.replaceAll('\n', '\n  ')}\n}`,
    )

    expect(await warningsOf(code, COMPONENT)).toEqual([])
  })
})

describe('the style linter in tokens.css', () => {
  it('lets hex, colour functions and px through', async () => {
    const code = `:root {\n  --color-ground: #f7f2e7;\n  --color-scrim: rgb(34 32 28 / 40%);\n  --line-thin: 1px;\n}\n`

    expect(await warningsOf(code, TOKENS)).toEqual([])
  })
})

describe('the styles of src', () => {
  it('pass the style linter', async () => {
    const { results } = await stylelint.lint({
      files: 'src/**/*.{css,vue}',
      configFile,
      cwd: root,
    })
    const problems = results.flatMap((result) =>
      result.warnings.map((warning) => `${result.source}:${warning.line} ${warning.text}`),
    )

    expect(problems).toEqual([])
  })
})
