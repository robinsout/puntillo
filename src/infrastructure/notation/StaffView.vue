<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { diatonicStep, type Pitch } from '@/domain/pitch'
import {
  isNote,
  type Duration,
  type Note,
  type NoteOrRest,
  type Question,
  type WrittenNote,
} from '@/domain/question'
import { stepFromBottomLine, type Clef } from '@/domain/staff'
import { LEDGER_OVERHANG, ledgerSteps, type HeardPlaces } from './staff-heard'
import StaffHeardLayer from './StaffHeardLayer.vue'
import type { NoteMark, StaffGhost, StaffHeard } from './staff-marks'
import type { StaffLayout } from './staff-layout'
import { staffLines } from './staff-lines'
import { rowPlan, type RowSlots } from './staff-row'

// With `written`, one per note of the question, null for none, the staff is drawn for writing:
// the notes written in place of the question notes, larger. A note written without a duration yet
// is a bare black head, which neither gives the duration away nor shows a wrong one.
const props = defineProps<{
  question: Question
  label: string
  singleLine?: boolean
  written?: readonly (WrittenNote | null)[]
  // Screen pixels per unit of the drawing in place of the screen's, for a small example.
  drawingScale?: number
  // The widest a bar is drawn, in units of the drawing: on a wide screen a line of few bars ends
  // short of the width, which is left empty on the right, rather than spread its notes far apart.
  maxBarWidth?: number
  // Once a question is checked: one per note of the question, rests aside, null for none.
  marks?: readonly (NoteMark | null)[]
  ghosts?: readonly (StaffGhost | null)[]
  // A note out of its bar, as in a list of mistakes: the time signature would say nothing.
  hideTimeSignature?: boolean
  // Drawn over the staff, which is not drawn again for it.
  heard?: StaffHeard | null
  // With a length, the staff is a row of questions of one note: the notes passed in the row, then
  // the note of the question, each in a slot of its own with a bar line after it. The rest of the
  // row is an empty staff up to its end. The marks, the ghosts and the heard note go by the notes
  // of the question only.
  passed?: readonly Note[]
  rowLength?: number
  rowEnd?: 'single' | 'final'
  // What the difficulty may draw in the row, which the row is laid out by.
  rowSlots?: RowSlots
}>()
const emit = defineEmits<{ 'load-error': []; drawn: [layout: StaffLayout] }>()

const container = useTemplateRef('container')
const drawing = useTemplateRef('drawing')

// viewBox units are pixels of the logical width: screen pixels divided by the scale below.
// The same aspect ratio reserves space before VexFlow loads, so the buttons do not shift.
const DEFAULT_WIDTH = 360
const LINE_HEIGHT = 150
const STAVE_X = 10
const STAVE_Y = 20
// Room the clef, each sign of the key signature and the time signature take at the start of
// a line, with some margin.
const CLEF_WIDTH = 40
const KEY_SIGN_WIDTH = 10
const TIME_SIGNATURE_WIDTH = 30
// A note gets at least 44 px across; a bar line takes a slot too, to stay on the safe side.
const SLOT_WIDTH = 48
// A sign before a note pushes its head right. A question with any sign widens every slot, so
// that its lines stay alike.
const ACCIDENTAL_WIDTH = 12
// The first note of a line keeps half a slot clear of the clef and the time signature, so that
// its target does not cover them.
const FIRST_NOTE_INSET = SLOT_WIDTH / 2
// The last glyph of the signs ends right at the stave's note start. Firefox draws the Bravura
// glyphs up to ~1 px wider than VexFlow measures them, so the margin is larger than it looks.
const SIGNS_CLEARANCE = 6

// A phone draws the staff smaller, so that a line holds more notes. The screen decides, not the
// container, so that an example in a dialog keeps the full size on a desktop.
const NARROW_SCREEN = 480
const NARROW_SCALE = 0.8
// Writing needs room to touch a step: the steps are half a staff space apart.
const WRITING_SCALE = 1.5
const scaleOfScreen = () =>
  props.drawingScale ??
  (window.innerWidth < NARROW_SCREEN ? NARROW_SCALE : 1) * (props.written ? WRITING_SCALE : 1)

const width = ref(DEFAULT_WIDTH)
const scale = ref(1)
// The drawing is laid out this wide and fit into the measured width, so it shrinks by the scale.
const logicalWidth = computed(() => width.value / scale.value)

const signsWidth = (question: Question, line: number) =>
  CLEF_WIDTH +
  KEY_SIGN_WIDTH * question.keySignature.count +
  (line === 0 && !props.hideTimeSignature ? TIME_SIGNATURE_WIDTH : 0)

// A target keeps its 44 px on the screen however small the drawing.
const slotWidth = (question: Question, scale: number) =>
  SLOT_WIDTH / scale + (question.notes.some((note) => note.accidental) ? ACCIDENTAL_WIDTH : 0)

const linesOf = (question: Question, drawingWidth: number, scale: number) =>
  staffLines(question, (line) => {
    if (props.singleLine) return Infinity
    const room = drawingWidth - 2 * STAVE_X - signsWidth(question, line) - FIRST_NOTE_INSET / scale
    return Math.max(1, Math.floor(room / slotWidth(question, scale)))
  })

type Line = ReturnType<typeof linesOf>[number]

// No wider than its bars allow, and never too narrow for the slots of its notes.
function staveWidth(question: Question, line: Line, index: number, drawingWidth: number) {
  const full = drawingWidth - 2 * STAVE_X
  if (props.maxBarWidth === undefined) return full
  const barLines = line.filter((slot) => slot.kind === 'bar line').length
  const bars = barLines + (line.at(-1)?.kind === 'bar line' ? 0 : 1)
  const needed =
    signsWidth(question, index) +
    FIRST_NOTE_INSET / scale.value +
    line.length * slotWidth(question, scale.value)
  return Math.min(full, Math.max(bars * props.maxBarWidth, needed))
}

// Of the drawing, as Stave draws its lines by default.
const STAFF_SPACE = 10
// Without the slots of the difficulty a row takes room for the most it may draw.
const ANY_SLOTS: RowSlots = { keySignatures: 7, signs: true, flags: true }

// The narrowest slot holds a head and the gap to the bar line, three staff spaces, with room for a
// sign before the head and a flag after it when the difficulty has them.
function planOfRow(length: number, drawingWidth: number, scale: number) {
  const { keySignatures, signs, flags } = props.rowSlots ?? ANY_SLOTS
  return rowPlan(length, {
    slot: SLOT_WIDTH / scale + (signs ? ACCIDENTAL_WIDTH : 0),
    minimum: STAFF_SPACE * (3 + (signs ? 1.25 : 0) + (flags ? 1 : 0)),
    staveRoom: drawingWidth - 2 * STAVE_X,
    signs: CLEF_WIDTH + KEY_SIGN_WIDTH * keySignatures,
  })
}

const lineCount = computed(() =>
  props.rowLength === undefined
    ? linesOf(props.question, logicalWidth.value, scale.value).length
    : planOfRow(props.rowLength, logicalWidth.value, scale.value).staves,
)
const reservedSpace = computed(() => ({
  aspectRatio: `${logicalWidth.value} / ${lineCount.value * LINE_HEIGHT}`,
}))

// An empty place keeps a note of the question's duration for the spacing, never drawn.
const EMPTY_PLACE: Pitch = { letter: 'B', octave: 4 }
// A quarter has the black head and no flag; its stem is hidden.
const BARE_HEAD: Duration = { value: 'quarter' }

// A separate chunk keeps VexFlow out of the initial bundle (spec §18).
// This entry bundles only the default Bravura and Academico fonts. The keys come with it, so that
// a screen that holds a staff it does not draw yet loads none of the code for VexFlow.
const vexflow = () =>
  Promise.all([import('vexflow/bravura'), import('./vexflow-keys')]).then(([library, keys]) => ({
    library,
    keys,
  }))

const SVG_NS = 'http://www.w3.org/2000/svg'
// A ghost is the outline of a black head without its stem, in staff spaces.
const GHOST_RX = 0.62
const GHOST_RY = 0.42
const GHOST_STROKE = 1.5
const GHOST_DASH = '2.5 2'

// The colours come from the tokens of the design system, as they are when the staff is drawn.
function markColours(element: Element): Record<NoteMark | 'passed', string> {
  const style = getComputedStyle(element)
  return {
    correct: style.getPropertyValue('--color-correct').trim(),
    wrong: style.getPropertyValue('--color-wrong').trim(),
    passed: style.getPropertyValue('--color-staff-passed').trim(),
  }
}

interface GhostPlace {
  readonly clef: Clef
  readonly x: number
  readonly bottomLine: number
  readonly spacing: number
  readonly colour: string
}

function svgElement(name: string, attributes: Record<string, string | number>) {
  const element = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value))
  return element
}

function ghostElement(ghost: StaffGhost, { clef, x, bottomLine, spacing, colour }: GhostPlace) {
  const step = stepFromBottomLine(ghost.pitch, clef)
  const yOf = (each: number) => bottomLine - (each * spacing) / 2
  const group = svgElement('g', { class: 'vf-ghost' })
  const ledgerHalf = (GHOST_RX + LEDGER_OVERHANG) * spacing
  for (const line of ledgerSteps(step))
    group.append(
      svgElement('line', {
        x1: x - ledgerHalf,
        x2: x + ledgerHalf,
        y1: yOf(line),
        y2: yOf(line),
        stroke: colour,
        'stroke-width': 1,
      }),
    )
  group.append(
    svgElement('ellipse', {
      cx: x,
      cy: yOf(step),
      rx: GHOST_RX * spacing,
      ry: GHOST_RY * spacing,
      fill: 'none',
      stroke: colour,
      'stroke-width': GHOST_STROKE,
      ...(ghost.mark === 'wrong' && { 'stroke-dasharray': GHOST_DASH }),
    }),
  )
  return group
}

// The heard note is placed by the latest drawing, so that it moves without drawing it again.
const heardLayer = shallowRef<{
  viewBox: string
  font: { family: string; size: string }
  places: HeardPlaces
}>()

let latest = 0
// No retry after a failure: the user is asked to reload the page.
let failed = false
// Once loaded, a redraw is synchronous: a moved note never shows a frame of the old drawing.
let loaded: Awaited<ReturnType<typeof vexflow>> | undefined

async function load() {
  const modules = await vexflow().catch(() => undefined)
  // VexFlow measures glyph widths with Bravura, so lay out after the font loads.
  // jsdom has no FontFaceSet.
  if (modules && 'fonts' in document)
    await document.fonts.load('1em Bravura').catch(() => undefined)
  return modules
}

async function draw() {
  if (failed) return
  const request = ++latest
  const modules = loaded ?? (await load())
  if (!modules) {
    // Several loads may be in flight; report the failure once.
    if (!failed) emit('load-error')
    failed = true
    return
  }
  loaded = modules
  const element = drawing.value
  // The question or the width may have changed while VexFlow was loading; draw only the latest.
  if (request !== latest || !element) return

  const {
    Renderer,
    Stave,
    StaveNote,
    BarNote,
    Barline,
    Dot,
    Accidental,
    Formatter,
    Voice,
    Metrics,
    TickContext,
    ModifierContext,
  } = modules.library
  const { toVexAccidental, toVexKey, toVexNote } = modules.keys
  type VexNote = InstanceType<typeof StaveNote>
  type VexStave = InstanceType<typeof Stave>
  const { question, rowLength } = props
  const drawingWidth = logicalWidth.value
  const noteInset = FIRST_NOTE_INSET / scale.value
  const row = rowLength === undefined ? null : planOfRow(rowLength, drawingWidth, scale.value)
  const lines = row ? [] : linesOf(question, drawingWidth, scale.value)
  const staveCount = row ? row.staves : lines.length
  const height = staveCount * LINE_HEIGHT
  element.replaceChildren()
  const renderer = new Renderer(element, Renderer.Backends.SVG)
  renderer.resize(drawingWidth, height)
  const context = renderer.getContext()

  const { beats, beatValue } = question.timeSignature
  const centreX = (note: VexNote) => (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2
  const notes: StaffLayout['notes'][number][] = []
  const rests: StaffLayout['rests'][number][] = []
  const starts: number[] = []
  const staffLineYs: { top: number; bottom: number }[] = []
  const columns: HeardPlaces['columns'][number][] = []
  let spacing = 0
  const { keySignature } = question
  // In writing, each note of the question is replaced by the one written in its place.
  let noteIndex = 0
  let markIndex = 0
  const colours = markColours(element)
  const ghosts: SVGElement[] = []
  const shown = (
    element: NoteOrRest,
  ): { element: NoteOrRest; hidden: boolean; headOnly: boolean } => {
    if (!props.written || !isNote(element)) return { element, hidden: false, headOnly: false }
    const written = props.written[noteIndex++] ?? null
    return {
      element: {
        pitch: written?.pitch ?? EMPTY_PLACE,
        duration: written?.duration ?? (written ? BARE_HEAD : element.duration),
        ...(written?.accidental && { accidental: written.accidental }),
      },
      hidden: written === null,
      headOnly: written !== null && written.duration === null,
    }
  }

  const newStave = (index: number, staveWidth: number) => {
    const stave = new Stave(STAVE_X, index * LINE_HEIGHT + STAVE_Y, staveWidth)
    stave.addClef(question.clef)
    if (keySignature.count !== 0) stave.addKeySignature(toVexKey(keySignature))
    return stave
  }

  const drawStave = (stave: VexStave, inset: number) => {
    const start = stave.getNoteStartX()
    starts.push((start + SIGNS_CLEARANCE) / drawingWidth)
    stave.setNoteStartX(start + inset)
    stave.setContext(context).draw()
    staffLineYs.push({ top: stave.getYForLine(0), bottom: stave.getYForLine(4) })
  }

  const vexNote = (element: NoteOrRest) => {
    const note = new StaveNote(toVexNote(element))
    // A dotted duration only counts its length; the dot itself is drawn as a modifier.
    if (element.duration.dots) Dot.buildAndAttach([note], { all: true })
    const sign = isNote(element) ? toVexAccidental(element) : undefined
    if (sign) note.addModifier(new Accidental(sign), 0)
    return note
  }

  const paint = (note: VexNote, colour: string) => {
    const style = { fillStyle: colour, strokeStyle: colour }
    note.setStyle(style)
    note.setLedgerLineStyle(style)
  }

  // The notes of the question on one stave, once placed: their marks were painted when made.
  type Ghosted = { note: VexNote; pitch: Pitch; ghost: StaffGhost }
  const markQuestionNote = (
    note: VexNote,
    element: NoteOrRest,
    index: number,
    ghosted: Ghosted[],
  ) => {
    const mark = props.marks?.[index] ?? null
    if (mark) paint(note, colours[mark])
    const ghost = props.ghosts?.[index] ?? null
    if (ghost && isNote(element)) ghosted.push({ note, pitch: element.pitch, ghost })
  }

  const report = (stave: VexStave, index: number, staveNotes: VexNote[], ghosted: Ghosted[]) => {
    spacing = stave.getSpacingBetweenLines()
    const ghostRights = new Map<VexNote, number>()
    for (const { note, pitch, ghost } of ghosted) {
      // A second apart, the heads would cover each other: as in a chord, the ghost goes beside.
      const second = Math.abs(diatonicStep(ghost.pitch) - diatonicStep(pitch)) === 1
      const headWidth = note.getNoteHeadEndX() - note.getNoteHeadBeginX()
      const x = centreX(note) + (second ? headWidth : 0)
      ghostRights.set(note, x + GHOST_RX * spacing)
      ghosts.push(
        ghostElement(ghost, {
          clef: question.clef,
          x,
          bottomLine: stave.getYForLine(4),
          spacing,
          colour: colours[ghost.mark],
        }),
      )
    }
    for (const note of staveNotes) {
      notes.push({
        x: centreX(note) / drawingWidth,
        y: (note.getYs()[0] ?? 0) / height,
        line: index,
      })
      columns.push({
        // The dots are the modifiers right of the head.
        right: Math.max(
          note.getNoteHeadEndX() + note.getMetrics().modRightPx,
          ghostRights.get(note) ?? -Infinity,
        ),
        topLine: stave.getYForLine(0),
        bottomLine: stave.getYForLine(4),
      })
    }
  }

  lines.forEach((line, index) => {
    const stave = newStave(index, staveWidth(question, line, index, drawingWidth))
    if (index === 0 && !props.hideTimeSignature) stave.addTimeSignature(`${beats}/${beatValue}`)
    // A bar line closing the line is the stave's own end.
    const closesBar = line.at(-1)?.kind === 'bar line'
    const slots = closesBar ? line.slice(0, -1) : line
    if (!closesBar && index < lines.length - 1) stave.setEndBarType(Barline.type.NONE)
    drawStave(stave, noteInset)

    const staveNotes: VexNote[] = []
    const staveRests: VexNote[] = []
    const hidden = new Set<VexNote>()
    const ghosted: Ghosted[] = []
    const tickables = slots.map((slot) => {
      if (slot.kind === 'bar line') return new BarNote()
      const index = isNote(slot.element) ? markIndex++ : -1
      const { element, hidden: isHidden, headOnly } = shown(slot.element)
      const note = vexNote(element)
      ;(isNote(element) ? staveNotes : staveRests).push(note)
      if (isHidden) hidden.add(note)
      if (headOnly) note.getStem()?.setVisibility(false)
      markQuestionNote(note, element, index, ghosted)
      return note
    })
    // A bar of several notes need not be full.
    const voice = new Voice({ numBeats: beats, beatValue })
      .setMode(Voice.Mode.SOFT)
      .addTickables(tickables)
    // Even spacing: proportional spacing leaves short notes too narrow a target on a phone.
    new Formatter({ softmaxFactor: 1 }).joinVoices([voice]).formatToStave([voice], stave)
    // As voice.draw(), but an empty place is only placed, for its Y values.
    for (const tickable of tickables) {
      tickable.setStave(stave).setContext(context)
      if (!(tickable instanceof StaveNote && hidden.has(tickable))) tickable.drawWithStyle()
    }
    report(stave, index, staveNotes, ghosted)
    for (const rest of staveRests) rests.push({ x: centreX(rest) / drawingWidth, line: index })
  })

  if (row) {
    const { perStave, slot, staveWidth } = row
    const passed = props.passed ?? []
    const all = [...passed, ...question.notes]
    // A sign before the head takes the left of the slot; the head stands in the middle of the rest.
    const signRoom = (props.rowSlots ?? ANY_SLOTS).signs ? ACCIDENTAL_WIDTH : 0
    // Placed by hand rather than by a Formatter: a slot stands where it stands however many are
    // drawn, and the empty slots hold nothing.
    const place = (
      tickable: VexNote | InstanceType<typeof BarNote>,
      stave: VexStave,
      x: number,
    ) => {
      tickable.addToModifierContext(new ModifierContext())
      const tick = new TickContext().addTickable(tickable).preFormat()
      tickable.setStave(stave).setContext(context)
      tick.setX(0)
      const at = tickable instanceof StaveNote ? centreX(tickable) : tickable.getAbsoluteX()
      tick.setX(x - at)
    }
    for (let index = 0; index < row.staves; index++) {
      const stave = newStave(index, staveWidth)
      stave.setEndBarType(Barline.type.NONE)
      drawStave(stave, 0)
      const start = stave.getNoteStartX()
      const first = index * perStave
      const onStave = all.slice(first, first + perStave)
      const staveNotes: VexNote[] = []
      const ghosted: Ghosted[] = []
      onStave.forEach((element, inStave) => {
        const note = vexNote(element)
        const ofQuestion = first + inStave - passed.length
        if (ofQuestion < 0) paint(note, colours.passed)
        else {
          staveNotes.push(note)
          markQuestionNote(note, element, ofQuestion, ghosted)
        }
        const slotStart = start + inStave * slot
        place(note, stave, slotStart + (slot + signRoom) / 2)
        note.drawWithStyle()
        // The bar line after the last slot of a stave is its end, past the room for the heard note.
        if (inStave === perStave - 1) return
        const bar = new BarNote()
        place(bar, stave, slotStart + slot)
        bar.drawWithStyle()
      })
      const final = index === row.staves - 1 && props.rowEnd === 'final'
      const end = new BarNote(final ? Barline.type.END : Barline.type.SINGLE)
      // A bar line is drawn right of its x: its right edge is the end of the staff lines.
      place(end, stave, stave.getX() + stave.getWidth() - 1)
      end.drawWithStyle()
      report(stave, index, staveNotes, ghosted)
    }
  }
  const layout: StaffLayout = {
    notes,
    rests,
    lines: starts.map((_, index) => ({
      left: starts[index] ?? 0,
      top: (index * LINE_HEIGHT) / height,
      bottom: ((index + 1) * LINE_HEIGHT) / height,
      topLine: (staffLineYs[index]?.top ?? 0) / height,
      bottomLine: (staffLineYs[index]?.bottom ?? 0) / height,
    })),
  }

  const svg = element.querySelector('svg')
  svg?.append(...ghosts)
  svg?.setAttribute('viewBox', `0 0 ${drawingWidth} ${height}`)
  svg?.setAttribute('width', '100%')
  svg?.removeAttribute('height')
  // resize() also sets inline pixel sizes, which would override the 100% width.
  svg?.style.removeProperty('width')
  svg?.style.removeProperty('height')
  // The root carries the accessible name; the glyphs are noise for screen readers.
  svg?.setAttribute('aria-hidden', 'true')
  // Inline, the drawing would leave a gap for descenders below it, and the layout's fractions of
  // the height would miss the staff lines.
  svg?.style.setProperty('display', 'block')
  const noteHeads = Metrics.getFontInfo('NoteHead')
  heardLayer.value = {
    viewBox: `0 0 ${drawingWidth} ${height}`,
    font: { family: noteHeads.family, size: `${noteHeads.size}pt` },
    places: { clef: question.clef, spacing, columns },
  }
  emit('drawn', layout)
}

// An element not laid out yet has no width.
const measuredWidth = () => container.value?.clientWidth || DEFAULT_WIDTH

let observer: ResizeObserver | undefined
let frame = 0

onMounted(() => {
  width.value = measuredWidth()
  scale.value = scaleOfScreen()
  void draw()
  if (typeof ResizeObserver === 'undefined' || !container.value) return
  // Redrawing changes the height of the element; doing it in the next frame keeps the observer
  // from reporting a resize loop.
  observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const measured = measuredWidth()
      // Turning a phone changes both the width and, maybe, the scale.
      const screenScale = scaleOfScreen()
      if (measured === width.value && screenScale === scale.value) return
      width.value = measured
      scale.value = screenScale
      void draw()
    })
  })
  observer.observe(container.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
const drawnKey = () =>
  JSON.stringify([
    props.written,
    props.marks,
    props.ghosts,
    props.passed,
    props.rowLength,
    props.rowEnd,
    props.rowSlots,
  ])
watch([() => props.question, drawnKey], draw)
</script>

<template>
  <div ref="container" class="staff-view" role="img" :aria-label="label" :style="reservedSpace">
    <div ref="drawing" />
    <StaffHeardLayer v-if="heard && heardLayer" :heard="heard" v-bind="heardLayer" />
  </div>
</template>

<style scoped>
/* The layer of the heard note lies over the drawing. */
.staff-view {
  position: relative;
}
</style>
