// Turns a Lighthouse JSON report into shields.io endpoint badges and checks the budget of spec §18.
// Usage: node scripts/lighthouse-badges.mjs <report.json> <out-dir>
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// Spec §18: the first interaction within 3 s on a mobile 4G connection.
const INTERACTIVE_BUDGET_MS = 3000

const [reportPath, outDir] = process.argv.slice(2)
if (!reportPath || !outDir) {
  console.error('Usage: node scripts/lighthouse-badges.mjs <report.json> <out-dir>')
  process.exit(2)
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
fs.mkdirSync(outDir, { recursive: true })

// The thresholds of the Lighthouse report itself: 90 and above is good, 50 and above is fair.
const colourOf = (score) => (score >= 90 ? 'brightgreen' : score >= 50 ? 'orange' : 'red')

function writeBadge(name, label, message, color) {
  const badge = { schemaVersion: 1, label, message, color }
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(badge))
}

const CATEGORIES = {
  performance: 'performance',
  accessibility: 'accessibility',
  'best-practices': 'best practices',
  seo: 'SEO',
}
for (const [id, label] of Object.entries(CATEGORIES)) {
  const score = Math.round(report.categories[id].score * 100)
  writeBadge(id, label, String(score), colourOf(score))
  console.log(`${label}: ${score}`)
}

const interactiveMs = report.audits.interactive.numericValue
const seconds = (interactiveMs / 1000).toFixed(1)
writeBadge(
  'interactive',
  'time to interactive',
  `${seconds} s`,
  interactiveMs <= INTERACTIVE_BUDGET_MS ? 'brightgreen' : 'red',
)
console.log(`time to interactive: ${seconds} s (budget ${INTERACTIVE_BUDGET_MS / 1000} s)`)

if (interactiveMs > INTERACTIVE_BUDGET_MS) {
  console.error(`Time to interactive ${seconds} s is over the budget of spec §18.`)
  process.exit(1)
}
