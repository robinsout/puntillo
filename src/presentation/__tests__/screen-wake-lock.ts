import type { ScreenWakeLock } from '@/application/ports'

// Stands in for the Screen Wake Lock behind the port: it counts the calls and knows whether the
// page keeps the screen on now.
export function fakeScreenWakeLock() {
  let keeps = 0
  let releases = 0
  let on = false
  const wakeLock: ScreenWakeLock = {
    keepOn() {
      keeps += 1
      on = true
    },
    release() {
      releases += 1
      on = false
    },
  }
  return {
    wakeLock,
    keeps: () => keeps,
    releases: () => releases,
    isOn: () => on,
  }
}

export type FakeScreenWakeLock = ReturnType<typeof fakeScreenWakeLock>
