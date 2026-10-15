import type { Locator, Page } from '@playwright/test'

// Feature design-system, slice 5: the figures of the results are tiles in a list of descriptions,
// each a term, the label, with its definition, the value: { Questions: '10', ... }.
export async function resultStats(page: Page): Promise<Record<string, string>> {
  const labels = await page.getByRole('term').allTextContents()
  const values = await page.getByRole('definition').allTextContents()
  return Object.fromEntries(
    labels.map((label, index) => [label.trim(), values[index]?.trim() ?? '']),
  )
}

// A line of Most mistakes gives the item and its count below it, apart from its staff, drawn for
// the eye only, and its links: "do4, whole note / 2 mistakes".
export function mistakeLines(items: Locator): Promise<string[]> {
  return items.evaluateAll((all) =>
    all.map((item) => {
      const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT)
      const texts: string[] = []
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const apart = node.parentElement?.closest(
          'a, svg, [role="link"], [role="img"], [aria-hidden="true"]',
        )
        const text = node.textContent?.replace(/\s+/g, ' ').trim()
        if (!apart && text) texts.push(text)
      }
      return texts.join(' / ')
    }),
  )
}
