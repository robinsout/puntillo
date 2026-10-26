// Renders the sounds the end-to-end tests play into the fake microphone of Chromium: a note like a
// trumpet, a fundamental with its overtones, between silences, as 16-bit mono WAV.
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
// The bright spectrum of a brass tone: strong low harmonics, the fundamental not the loudest.
const HARMONICS = [0.6, 1, 0.8, 0.55, 0.35, 0.2, 0.12, 0.06]
const PEAK = 0.7

const SOUNDS = {
  'trumpet-re4.wav': 62,
  'trumpet-mi4.wav': 64,
}

const frequencyOf = (number) => 440 * 2 ** ((number - 69) / 12)

function envelope(t) {
  if (t < ATTACK_S) return t / ATTACK_S
  if (t > NOTE_S - RELEASE_S) return Math.max(0, (NOTE_S - t) / RELEASE_S)
  return 1
}

function render(number) {
  const fundamental = frequencyOf(number)
  const total = Math.round((SILENCE_BEFORE_S + NOTE_S + SILENCE_AFTER_S) * SAMPLE_RATE)
  const start = Math.round(SILENCE_BEFORE_S * SAMPLE_RATE)
  const length = Math.round(NOTE_S * SAMPLE_RATE)
  const norm = HARMONICS.reduce((sum, amplitude) => sum + amplitude, 0)
  const samples = new Int16Array(total)
  for (let index = 0; index < length; index += 1) {
    const t = index / SAMPLE_RATE
    let value = 0
    HARMONICS.forEach((amplitude, harmonic) => {
      value += amplitude * Math.sin(2 * Math.PI * fundamental * (harmonic + 1) * t)
    })
    samples[start + index] = Math.round(((PEAK * envelope(t) * value) / norm) * 32_767)
  }
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
for (const [name, number] of Object.entries(SOUNDS)) {
  fs.writeFileSync(path.join(OUT_DIR, name), wav(render(number)))
}
