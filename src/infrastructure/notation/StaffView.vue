<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue'
import type { Question } from '@/domain/question'
import type { StaffLayout } from './staff-layout'
import { toVexNote } from './vexflow-keys'

const props = defineProps<{ question: Question; label: string }>()
const emit = defineEmits<{ 'load-error': []; drawn: [layout: StaffLayout] }>()

const container = useTemplateRef('container')

// viewBox units. The SVG stretches to the container width, so it fits a 360 px screen,
// and the same aspect ratio reserves space before VexFlow loads, so the buttons do not shift.
const WIDTH = 360
const HEIGHT = 150
const STAVE_X = 10
const STAVE_Y = 20
const reservedSpace = { aspectRatio: `${WIDTH} / ${HEIGHT}` }

// A separate chunk keeps VexFlow out of the initial bundle (spec §18).
// This entry bundles only the default Bravura and Academico fonts.
const vexflow = () => import('vexflow/bravura')

let latest = 0
// No retry after a failure: the user is asked to reload the page.
let failed = false

async function draw(question: Question) {
  if (failed) return
  const request = ++latest
  const library = await vexflow().catch(() => undefined)
  if (!library) {
    // Several loads may be in flight; report the failure once.
    if (!failed) emit('load-error')
    failed = true
    return
  }
  // VexFlow measures glyph widths with Bravura, so lay out after the font loads.
  // jsdom has no FontFaceSet.
  if ('fonts' in document) await document.fonts.load('1em Bravura').catch(() => undefined)
  const element = container.value
  // The question may have changed while VexFlow was loading; draw only the latest one.
  if (request !== latest || !element) return

  const { Renderer, Stave, StaveNote, Formatter, Voice } = library
  element.replaceChildren()
  const renderer = new Renderer(element, Renderer.Backends.SVG)
  renderer.resize(WIDTH, HEIGHT)
  const context = renderer.getContext()

  const { beats, beatValue } = question.timeSignature
  const stave = new Stave(STAVE_X, STAVE_Y, WIDTH - 2 * STAVE_X)
    .addClef(question.clef)
    .addTimeSignature(`${beats}/${beatValue}`)
  stave.setContext(context).draw()
  const notes = question.notes.map((note) => new StaveNote(toVexNote(note)))
  // A bar of several notes need not be full.
  const voice = new Voice({ numBeats: beats, beatValue })
    .setMode(Voice.Mode.SOFT)
    .addTickables(notes)
  // Even spacing: proportional spacing leaves short notes too narrow a target on a phone.
  new Formatter({ softmaxFactor: 1 }).joinVoices([voice]).formatToStave([voice], stave)
  voice.draw(context, stave)
  const layout: StaffLayout = {
    notes: notes.map((note) => ({
      x: (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2 / WIDTH,
      y: (note.getYs()[0] ?? 0) / HEIGHT,
    })),
  }

  const svg = element.querySelector('svg')
  svg?.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
  svg?.setAttribute('width', '100%')
  svg?.removeAttribute('height')
  // resize() also sets inline pixel sizes, which would override the 100% width.
  svg?.style.removeProperty('width')
  svg?.style.removeProperty('height')
  // The root carries the accessible name; the glyphs are noise for screen readers.
  svg?.setAttribute('aria-hidden', 'true')
  emit('drawn', layout)
}

onMounted(() => draw(props.question))
watch(() => props.question, draw)
</script>

<template>
  <div ref="container" role="img" :aria-label="label" :style="reservedSpace" />
</template>
