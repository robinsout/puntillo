<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { isNote, type Question } from '@/domain/question'
import type { StaffLayout } from './staff-layout'
import { staffLines } from './staff-lines'
import { toVexNote } from './vexflow-keys'

const props = defineProps<{ question: Question; label: string; singleLine?: boolean }>()
const emit = defineEmits<{ 'load-error': []; drawn: [layout: StaffLayout] }>()

const container = useTemplateRef('container')

// viewBox units are pixels of the measured width, so a slot's width holds on the screen.
// The same aspect ratio reserves space before VexFlow loads, so the buttons do not shift.
const DEFAULT_WIDTH = 360
const LINE_HEIGHT = 150
const STAVE_X = 10
const STAVE_Y = 20
// Room the clef and the time signature take at the start of a line, with some margin.
const CLEF_WIDTH = 40
const TIME_SIGNATURE_WIDTH = 30
// A note gets at least 44 px across; a bar line takes a slot too, to stay on the safe side.
const SLOT_WIDTH = 48
// The first note of a line keeps half a slot clear of the clef and the time signature, so that
// its target does not cover them.
const FIRST_NOTE_INSET = SLOT_WIDTH / 2
// The last glyph of the signs ends right at the stave's note start; leave the targets some air.
const SIGNS_CLEARANCE = 2

const width = ref(DEFAULT_WIDTH)

const linesOf = (question: Question, drawingWidth: number) =>
  staffLines(question, (line) => {
    if (props.singleLine) return Infinity
    const signs = CLEF_WIDTH + (line === 0 ? TIME_SIGNATURE_WIDTH : 0)
    const room = drawingWidth - 2 * STAVE_X - signs - FIRST_NOTE_INSET
    return Math.max(1, Math.floor(room / SLOT_WIDTH))
  })

const lineCount = computed(() => linesOf(props.question, width.value).length)
const reservedSpace = computed(() => ({
  aspectRatio: `${width.value} / ${lineCount.value * LINE_HEIGHT}`,
}))

// A separate chunk keeps VexFlow out of the initial bundle (spec §18).
// This entry bundles only the default Bravura and Academico fonts.
const vexflow = () => import('vexflow/bravura')

let latest = 0
// No retry after a failure: the user is asked to reload the page.
let failed = false

async function draw() {
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
  // The question or the width may have changed while VexFlow was loading; draw only the latest.
  if (request !== latest || !element) return

  const { Renderer, Stave, StaveNote, BarNote, Barline, Formatter, Voice } = library
  const { question } = props
  const drawingWidth = width.value
  const lines = linesOf(question, drawingWidth)
  const height = lines.length * LINE_HEIGHT
  element.replaceChildren()
  const renderer = new Renderer(element, Renderer.Backends.SVG)
  renderer.resize(drawingWidth, height)
  const context = renderer.getContext()

  const { beats, beatValue } = question.timeSignature
  const centreX = (note: InstanceType<typeof StaveNote>) =>
    (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2
  const notes: StaffLayout['notes'][number][] = []
  const rests: StaffLayout['rests'][number][] = []
  const starts: number[] = []
  lines.forEach((line, index) => {
    const stave = new Stave(STAVE_X, index * LINE_HEIGHT + STAVE_Y, drawingWidth - 2 * STAVE_X)
    stave.addClef(question.clef)
    if (index === 0) stave.addTimeSignature(`${beats}/${beatValue}`)
    // A bar line closing the line is the stave's own end.
    const closesBar = line.at(-1)?.kind === 'bar line'
    const slots = closesBar ? line.slice(0, -1) : line
    if (!closesBar && index < lines.length - 1) stave.setEndBarType(Barline.type.NONE)
    const start = stave.getNoteStartX()
    starts.push((start + SIGNS_CLEARANCE) / drawingWidth)
    stave.setNoteStartX(start + FIRST_NOTE_INSET)
    stave.setContext(context).draw()

    const staveNotes: InstanceType<typeof StaveNote>[] = []
    const staveRests: InstanceType<typeof StaveNote>[] = []
    const tickables = slots.map((slot) => {
      if (slot.kind === 'bar line') return new BarNote()
      const note = new StaveNote(toVexNote(slot.element))
      ;(isNote(slot.element) ? staveNotes : staveRests).push(note)
      return note
    })
    // A bar of several notes need not be full.
    const voice = new Voice({ numBeats: beats, beatValue })
      .setMode(Voice.Mode.SOFT)
      .addTickables(tickables)
    // Even spacing: proportional spacing leaves short notes too narrow a target on a phone.
    new Formatter({ softmaxFactor: 1 }).joinVoices([voice]).formatToStave([voice], stave)
    voice.draw(context, stave)
    for (const note of staveNotes) {
      notes.push({
        x: centreX(note) / drawingWidth,
        y: (note.getYs()[0] ?? 0) / height,
        line: index,
      })
    }
    for (const rest of staveRests) rests.push({ x: centreX(rest) / drawingWidth, line: index })
  })
  const layout: StaffLayout = {
    notes,
    rests,
    lines: lines.map((_, index) => ({
      left: starts[index] ?? 0,
      top: (index * LINE_HEIGHT) / height,
      bottom: ((index + 1) * LINE_HEIGHT) / height,
    })),
  }

  const svg = element.querySelector('svg')
  svg?.setAttribute('viewBox', `0 0 ${drawingWidth} ${height}`)
  svg?.setAttribute('width', '100%')
  svg?.removeAttribute('height')
  // resize() also sets inline pixel sizes, which would override the 100% width.
  svg?.style.removeProperty('width')
  svg?.style.removeProperty('height')
  // The root carries the accessible name; the glyphs are noise for screen readers.
  svg?.setAttribute('aria-hidden', 'true')
  emit('drawn', layout)
}

// An element not laid out yet has no width.
const measuredWidth = () => container.value?.clientWidth || DEFAULT_WIDTH

let observer: ResizeObserver | undefined
let frame = 0

onMounted(() => {
  width.value = measuredWidth()
  void draw()
  if (typeof ResizeObserver === 'undefined' || !container.value) return
  // Redrawing changes the height of the element; doing it in the next frame keeps the observer
  // from reporting a resize loop.
  observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const measured = measuredWidth()
      if (measured === width.value) return
      width.value = measured
      void draw()
    })
  })
  observer.observe(container.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
watch(() => props.question, draw)
</script>

<template>
  <div ref="container" role="img" :aria-label="label" :style="reservedSpace" />
</template>
