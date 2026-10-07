<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue'
import type { Question } from '@/domain/question'
import { toVexNote } from './vexflow-keys'

const props = defineProps<{ question: Question; label: string }>()
const emit = defineEmits<{ 'load-error': [] }>()

const container = useTemplateRef('container')

// Размер рисунка в единицах viewBox. SVG тянется по ширине контейнера,
// поэтому помещается в экран 360 px без горизонтальной прокрутки.
// Та же пропорция резервирует место до загрузки VexFlow, чтобы кнопки не сдвигались.
const WIDTH = 360
const HEIGHT = 150
const STAVE_X = 10
const STAVE_Y = 20
const reservedSpace = { aspectRatio: `${WIDTH} / ${HEIGHT}` }

// VexFlow грузится отдельным чанком, чтобы не попасть в начальную сборку (ТЗ 18).
// Сборка только с Bravura и Academico — шрифтами по умолчанию, без остальных.
const vexflow = () => import('vexflow/bravura')

let latest = 0
// После отказа загрузки не повторяем её: пользователю предлагают перезагрузить страницу.
let failed = false

async function draw(question: Question) {
  if (failed) return
  const request = ++latest
  const library = await vexflow().catch(() => undefined)
  if (!library) {
    // Загрузок в полёте может быть несколько, сообщаем об отказе один раз.
    if (!failed) emit('load-error')
    failed = true
    return
  }
  // Ширины глифов VexFlow меряет по Bravura: раскладываем после загрузки шрифта.
  // В окружении без FontFaceSet (jsdom) ждать нечего.
  if ('fonts' in document) await document.fonts.load('1em Bravura').catch(() => undefined)
  const element = container.value
  // Пока грузился VexFlow, вопрос мог смениться: рисуем только последний.
  if (request !== latest || !element) return

  const { Renderer, Stave, StaveNote, Formatter } = library
  element.replaceChildren()
  const renderer = new Renderer(element, Renderer.Backends.SVG)
  renderer.resize(WIDTH, HEIGHT)
  const context = renderer.getContext()

  const { beats, beatValue } = question.timeSignature
  const stave = new Stave(STAVE_X, STAVE_Y, WIDTH - 2 * STAVE_X)
    .addClef(question.clef)
    .addTimeSignature(`${beats}/${beatValue}`)
  stave.setContext(context).draw()
  Formatter.FormatAndDraw(context, stave, [new StaveNote(toVexNote(question.note))])

  const svg = element.querySelector('svg')
  svg?.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
  svg?.setAttribute('width', '100%')
  svg?.removeAttribute('height')
  // resize() задаёт и inline-размеры в пикселях, они перебили бы ширину 100%.
  svg?.style.removeProperty('width')
  svg?.style.removeProperty('height')
  // Имя изображения задаёт корень, глифы скринридеру не нужны.
  svg?.setAttribute('aria-hidden', 'true')
}

onMounted(() => draw(props.question))
watch(() => props.question, draw)
</script>

<template>
  <div ref="container" role="img" :aria-label="label" :style="reservedSpace" />
</template>
