---
practice:
  low: C4
  high: G5
  ledgerLines: 0
  durations: [quarter]
  askDuration: false
  questionLength: one-bar
  timeSignatures: [4/4]
  keySignatures: 7
  accidentals: none
  rests: false
  dots: false
related: [accidentals, keys]
hint:
  text: >-
    A sign of the key signature holds for every note of its step in every octave, so such notes
    get no sign of their own. A **natural** cancels it to the end of the bar for the notes of the
    same pitch in the same octave.
  example: 4/4 1# F4/quarter F5/quarter Fn5/half
  label: One sharp in the key signature holds in both octaves, and a natural cancels it
---

When a piece keeps using the same sharps or flats, they are not written before every note.
Instead they stand once, at the start of each line of the staff, right after the clef and before
the time signature; the time signature is written on the first line only. These signs are the
**key signature**.

A sign of the key signature holds for every note of its step, in every octave, until the key
changes. A note altered by the key signature gets no sign of its own.

```staff One sharp in the key signature: the notes on its step sound sharp in both octaves, with no sign of their own
4/4 1# F4/half F5/half
```

Sharps always come in the same order: :note[F#4], :note[C#4], :note[G#4], :note[D#4],
:note[A#4], :note[E#4], :note[B#4]. Flats come in the reverse order: :note[Bb4], :note[Eb4],
:note[Ab4], :note[Db4], :note[Gb4], :note[Cb4], :note[Fb4]. No sign is skipped: a key signature
of three sharps is always :note[F#4], :note[C#4] and :note[G#4].

```staff Seven sharps in their order
4/4 7# C5/whole
```

```staff Seven flats in their order
4/4 7b C5/whole
```

Each sign has its own place on the staff. The first sharp stands on the top line, the line of
:note[F5]; the first flat stands on the middle line, the line of :note[B4].

```staff Two sharps: the notes on their steps sound sharp, the others plain
4/4 2# D4/quarter F4/quarter A4/quarter C5/quarter
```

```staff Three flats: the notes on their steps sound flat, the others plain
4/4 3b E4/quarter G4/quarter A4/quarter B4/quarter
```
