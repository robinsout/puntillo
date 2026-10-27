import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { CounterOptOut } from '@/application/ports'
import type { Locale } from '@/domain/language'
import { renderSettings } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { counterOptOutKey } from '@/presentation/dependencies'

// Feature visit-counter, slice 3 of 3, criteria 5 and 6, edge case 1: the screen Settings ends with
// the group Privacy, a box Don't count my visits described by what is counted. The box shows the
// switch as kept and turns it on and off; it stays as it is with Global Privacy Control, and is
// disabled, with a line saying why, where the browser cannot save it. How the switch is kept:
// infrastructure/analytics/__tests__/counter-opt-out.spec.ts.

afterEach(() => {
  cleanup()
  forgetDialogs()
  Reflect.deleteProperty(navigator, 'globalPrivacyControl')
})

const TEXTS = {
  en: {
    privacy: 'Privacy',
    box: "Don't count my visits",
    note: 'No cookies or IP; the day, device type and screen are counted.',
    notSaved: "Your browser doesn't let this choice be saved.",
    microphone: "Microphone sound is processed on this device and isn't sent anywhere.",
  },
  ru: {
    privacy: 'Конфиденциальность',
    box: 'Не считать мои визиты',
    note: 'Без cookies и IP; учитываются день, тип устройства и экран.',
    notSaved: 'Браузер не даёт сохранить этот выбор.',
    microphone: 'Звук микрофона обрабатывается на этом устройстве и никуда не отправляется.',
  },
  es: {
    privacy: 'Privacidad',
    box: 'No contar mis visitas',
    note: 'Sin cookies ni IP; se cuentan el día, el tipo de dispositivo y la pantalla.',
    notSaved: 'El navegador no permite guardar esta elección.',
    microphone:
      'El sonido del micrófono se procesa en este dispositivo y no se envía a ningún sitio.',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en
const LOCALES = Object.keys(TEXTS) as Locale[]

// Keeps the switch as the browser would between renders, and records every change asked of it.
function fakeOptOut({ off = false, canSave = true } = {}) {
  let kept = off
  const changes: boolean[] = []
  const optOut: CounterOptOut = {
    isOff: () => kept,
    setOff(value) {
      changes.push(value)
      kept = value
    },
    canSave: () => canSave,
  }
  return { optOut, changes }
}

const renderWith = (optOut: CounterOptOut, locale: Locale = 'en') =>
  renderSettings({ locale, provides: { [counterOptOutKey as symbol]: optOut } })

function privacy(locale: Locale = 'en') {
  const section = screen
    .getByRole('heading', { level: 2, name: TEXTS[locale].privacy })
    .closest('section')
  if (!section) throw new Error('the heading Privacy heads no section')
  return within(section)
}

const box = (locale: Locale = 'en') =>
  privacy(locale).getByRole<HTMLInputElement>('checkbox', { name: TEXTS[locale].box })

// What a screen reader says after the name of the element: the texts it is described by.
function descriptionOf(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
}

describe('the group Privacy (criterion 5)', () => {
  it.each(LOCALES)('has the box Don’t count my visits in %s', async (locale) => {
    await renderWith(fakeOptOut().optOut, locale)

    expect(box(locale)).toBeTruthy()
  })

  it.each(LOCALES)('says what is counted in %s', async (locale) => {
    await renderWith(fakeOptOut().optOut, locale)

    expect(privacy(locale).getByText(TEXTS[locale].note)).toBeTruthy()
  })

  it.each(LOCALES)('describes the box by what is counted in %s', async (locale) => {
    await renderWith(fakeOptOut().optOut, locale)

    expect(descriptionOf(box(locale))).toBe(TEXTS[locale].note)
  })

  it('has nothing more than the box and the line', async () => {
    await renderWith(fakeOptOut().optOut)

    expect(privacy().getAllByRole('checkbox')).toHaveLength(1)
    expect(privacy().queryByRole('button')).toBeNull()
    expect(privacy().queryByRole('link')).toBeNull()
  })
})

describe('the box Don’t count my visits (criterion 5)', () => {
  it('is not ticked while the visits are counted', async () => {
    await renderWith(fakeOptOut({ off: false }).optOut)

    expect(box().checked).toBe(false)
  })

  it('is ticked when the switch was turned on before, here or in another project', async () => {
    await renderWith(fakeOptOut({ off: true }).optOut)

    expect(box().checked).toBe(true)
  })

  it('turns the switch on when ticked', async () => {
    const { optOut, changes } = fakeOptOut()
    await renderWith(optOut)

    await fireEvent.click(box())

    expect(changes).toEqual([true])
    expect(box().checked).toBe(true)
  })

  it('turns the switch off when unticked', async () => {
    const { optOut, changes } = fakeOptOut({ off: true })
    await renderWith(optOut)

    await fireEvent.click(box())

    expect(changes).toEqual([false])
    expect(box().checked).toBe(false)
  })

  it('stays ticked after a reload', async () => {
    const { optOut } = fakeOptOut()
    const first = await renderWith(optOut)
    await fireEvent.click(box())
    first.unmount()

    await renderWith(optOut)

    expect(box().checked).toBe(true)
  })

  it('can be ticked and saved: no line about saving', async () => {
    await renderWith(fakeOptOut().optOut)

    expect(box().disabled).toBe(false)
    expect(screen.queryByText(EN.notSaved)).toBeNull()
  })
})

describe('the box with Global Privacy Control (criterion 6)', () => {
  it('is there and works as without it', async () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true })
    const { optOut, changes } = fakeOptOut()
    await renderWith(optOut)

    expect(box().disabled).toBe(false)
    expect(box().checked).toBe(false)
    await fireEvent.click(box())

    expect(changes).toEqual([true])
    expect(box().checked).toBe(true)
  })
})

describe('the box when the browser cannot save the choice (edge case 1)', () => {
  it('is there, but disabled', async () => {
    await renderWith(fakeOptOut({ canSave: false }).optOut)

    expect(box().disabled).toBe(true)
  })

  it.each(LOCALES)('says why beside it in %s', async (locale) => {
    await renderWith(fakeOptOut({ canSave: false }).optOut, locale)

    expect(privacy(locale).getByText(TEXTS[locale].notSaved)).toBeTruthy()
  })

  it('is described by why as well as by what is counted', async () => {
    await renderWith(fakeOptOut({ canSave: false }).optOut)

    const description = descriptionOf(box())
    expect(description).toContain(EN.note)
    expect(description).toContain(EN.notSaved)
  })

  it('does not change the switch when clicked', async () => {
    const { optOut, changes } = fakeOptOut({ canSave: false })
    await renderWith(optOut)

    await fireEvent.click(box())

    expect(changes).toEqual([])
    expect(box().checked).toBe(false)
  })
})

// Feature microphone-input, slice 5 of 5, criterion 16: the group Privacy says that the sound of the
// microphone stays on the device, whatever the note input chosen. The line is about the microphone,
// not the box, so the box is not described by it.
describe('the line about the microphone (criterion 16)', () => {
  it.each(LOCALES)('is in the group Privacy in %s', async (locale) => {
    await renderWith(fakeOptOut().optOut, locale)

    expect(privacy(locale).getByText(TEXTS[locale].microphone)).toBeTruthy()
  })

  it('is there with the note names chosen, not only with the microphone', async () => {
    await renderWith(fakeOptOut().optOut)

    expect(privacy().getByText(EN.microphone)).toBeTruthy()
  })

  it('is there when the browser cannot save the choice, beside the line saying so', async () => {
    await renderWith(fakeOptOut({ canSave: false }).optOut)

    expect(privacy().getByText(EN.microphone)).toBeTruthy()
    expect(privacy().getByText(EN.notSaved)).toBeTruthy()
  })

  it('does not describe the box', async () => {
    await renderWith(fakeOptOut().optOut)

    expect(descriptionOf(box())).not.toContain(EN.microphone)
  })
})
