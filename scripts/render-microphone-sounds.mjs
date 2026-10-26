// Renders the sounds the end-to-end tests play into the fake microphone of Chromium: notes like a
// trumpet, a fundamental with its overtones, between silences, as 16-bit mono WAV. A note may be
// tongued again: its sound falls for a moment, not to silence, and rises with a new attack.
// Usage: node scripts/render-microphone-sounds.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = fileURLToPath(new URL('../e2e/fixtures/', import.meta.url))

const SAMPLE_RATE = 44_100
const SILENCE_BEFORE_S = 0.4
const NOTE_S = 1.2
const SILENCE_AFTER_S = 0.8
const ATTACK_S = 0.04
const RELEASE_S = 0.08
// A phrase waits for the page to listen and draw the staff, so that no note of it is cut.
const PHRASE_BEFORE_S = 1.5
const PHRASE_NOTE_S = 0.6
const PHRASE_GAP_S = 0.3
// A tongued attack: the sound falls to a fifth, stays there a little, and rises again.
const TONGUE_FLOOR = 0.2
const TONGUE_FALL_S = 0.03
const TONGUE_LOW_S = 0.08
// The bright spectrum of a brass tone: strong low harmonics, the fundamental not the loudest.
const HARMONICS = [0.6, 1, 0.8, 0.55, 0.35, 0.2, 0.12, 0.06]
const PEAK = 0.7

const DO4 = 60
const RE4 = 62
const MI4 = 64
const SOL4 = 67

// A note, its MIDI number and how long it sounds; several lengths are the note tongued again
// between them.
const note = (number, ...lengths) => ({ number, lengths })

const single = (number) => ({
  before: SILENCE_BEFORE_S,
  notes: [note(number, NOTE_S)],
  gap: 0,
  after: SILENCE_AFTER_S,
})

const phrase = (...notes) => ({
  before: PHRASE_BEFORE_S,
  notes,
  gap: PHRASE_GAP_S,
  after: PHRASE_BEFORE_S,
})

const SOUNDS = {
  'trumpet-re4.wav': single(RE4),
  'trumpet-mi4.wav': single(MI4),
  'trumpet-do4-mi4-sol4.wav': phrase(
    note(DO4, PHRASE_NOTE_S),
    note(MI4, PHRASE_NOTE_S),
    note(SOL4, PHRASE_NOTE_S),
  ),
  // Re4, mi4 and re4, then do4 tongued twice.
  'trumpet-re4-mi4-re4-do4-do4.wav': phrase(
    note(RE4, PHRASE_NOTE_S),
    note(MI4, PHRASE_NOTE_S),
    note(RE4, PHRASE_NOTE_S),
    note(DO4, PHRASE_NOTE_S, PHRASE_NOTE_S),
  ),
}

const frequencyOf = (number) => 440 * 2 ** ((number - 69) / 12)

const sum = (values) => values.reduce((total, value) => total + value, 0)

function envelope(t, length) {
  if (t < ATTACK_S) return t / ATTACK_S
  if (t > length - RELEASE_S) return Math.max(0, (length - t) / RELEASE_S)
  return 1
}

// The fall of a tongued attack at each boundary between the lengths of a note.
function tongued(t, boundaries) {
  let level = 1
  for (const at of boundaries) {
    const from = at - TONGUE_LOW_S / 2
    const to = at + TONGUE_LOW_S / 2
    if (t >= from - TONGUE_FALL_S && t < from)
      level = Math.min(level, 1 - ((1 - TONGUE_FLOOR) * (t - from + TONGUE_FALL_S)) / TONGUE_FALL_S)
    else if (t >= from && t <= to) level = Math.min(level, TONGUE_FLOOR)
    else if (t > to && t <= to + TONGUE_FALL_S)
      level = Math.min(level, TONGUE_FLOOR + ((1 - TONGUE_FLOOR) * (t - to)) / TONGUE_FALL_S)
  }
  return level
}

function render({ before, notes, gap, after }) {
  const lengths = notes.map(({ lengths }) => sum(lengths))
  const seconds = before + sum(lengths) + gap * (notes.length - 1) + after
  const samples = new Int16Array(Math.round(seconds * SAMPLE_RATE))
  const norm = sum(HARMONICS)
  let start = before
  notes.forEach(({ number, lengths: parts }, index) => {
    const fundamental = frequencyOf(number)
    const length = lengths[index]
    const boundaries = parts.slice(0, -1).map((_, part) => sum(parts.slice(0, part + 1)))
    const from = Math.round(start * SAMPLE_RATE)
    const count = Math.round(length * SAMPLE_RATE)
    for (let sample = 0; sample < count; sample += 1) {
      const t = sample / SAMPLE_RATE
      let value = 0
      HARMONICS.forEach((amplitude, harmonic) => {
        value += amplitude * Math.sin(2 * Math.PI * fundamental * (harmonic + 1) * t)
      })
      const level = envelope(t, length) * tongued(t, boundaries)
      samples[from + sample] = Math.round(((PEAK * level * value) / norm) * 32_767)
    }
    start += length + gap
  })
  return samples
}

function wav(samples) {
  const data = Buffer.from(samples.buffer)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const [name, sound] of Object.entries(SOUNDS)) {
  fs.writeFileSync(path.join(OUT_DIR, name), wav(render(sound)))
}
