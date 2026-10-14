import type { Page } from '@playwright/test'

// The end-to-end tests run silent in every engine: WebKit has no switch like Chromium's
// --mute-audio, so whatever the page connects to the speakers goes through a gain of 0. The page
// still plays, so what it starts can be counted.
export async function muteAudio(page: Page) {
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect as (
      this: AudioNode,
      ...args: unknown[]
    ) => AudioNode | void
    const silencers = new WeakMap<BaseAudioContext, GainNode>()
    const silencerOf = (context: BaseAudioContext) => {
      let silencer = silencers.get(context)
      if (!silencer) {
        silencer = context.createGain()
        silencer.gain.value = 0
        connect.call(silencer, context.destination)
        silencers.set(context, silencer)
      }
      return silencer
    }
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      const [destination, ...rest] = args
      if (destination instanceof AudioDestinationNode) {
        connect.call(this, silencerOf(destination.context), ...rest)
        return destination
      }
      return connect.apply(this, args)
    } as typeof AudioNode.prototype.connect
  })
}
