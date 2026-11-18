# Type · MIDI note generator

Makes notes: arpeggiator, step sequencer, chord generator, euclidean rhythm, random melody, note hold. Takes notes and transport in, sends notes out. No audio.

Read first: [01-architecture.md](../01-architecture.md). Host details: [03](../03-web-host.md), [04](../04-vst-host.md).

## IvanDAW manifest

```ts
export const manifest: PluginManifest = {
  id: '<id>', name: '<Name>', vendor: 'zhirnovcodes', version: VERSION, apiVersion: 2,
  kind: 'midi',
  ports: [
    { id: 'in',  label: 'Notes', kind: 'events', direction: 'in',  accepts: ['midi', 'automation', 'tempo', 'transport'] },
    { id: 'out', label: 'Notes', kind: 'events', direction: 'out', accepts: ['midi'] },
  ],
  ui: { width: 420, height: 260, resizable: false },   // or null: host shows a generic strip
  features: ['state'],
};
```

A pure generator with no note input (like `note-gen`) drops `midi` from `accepts`.

## JUCE

Two targets: `<Name>` (VST3 + Standalone, instrument with MIDI out) and `<Name>MidiFx` (AU MIDI FX for Logic). Exact CMake in [04](../04-vst-host.md#midi-generator-and-midi-control-two-targets). CI builds `<Name>_VST3 <Name>_Standalone <Name>MidiFx_AU` and runs `auval -strict -v aumi <CODEFX> <MFR>`.

## Core behaviour

`Engine::process(frames, nullptr, nullptr, out)` pushes `OutEvent{ kind: Midi }`.

Timing is in beats, from the transport:

```cpp
// beat at frame f of this block
double beatAt(int f) const { return beat0_ + f * bpm_ / (60.0 * sampleRate_); }
```

- On `transport(t, frame)`: store `beat0_` so `beatAt(frame) == t.beat`, store `bpm_`, `playing_`.
- Each `process`: for every step boundary `b` in `[beatAt(0), beatAt(frames))`, compute `frame = ceil((b - beat0_) * 60 * sampleRate / bpm)` and push note-on. Schedule its note-off `gate * stepLength` beats later; keep pending note-offs in a fixed array (no allocation).
- Step boundaries come from beats, never from counting frames, so the pattern stays locked to the bar after tempo changes and loop jumps.
- Not playing: no new notes. Pending note-offs still fire.

Notes in (arp, chord): keep a fixed-size held-notes set (128 bools + order list). Note-on with velocity 0 = note-off.

## Rules

| Rule | Why |
| --- | --- |
| Every note-on gets a note-off, including on stop, `allOff`, `setState`, `dispose`, and bypass | IvanDAW and every DAW hang notes otherwise |
| CC 120 / 123 in → `allOff(frame)` → push note-offs for every sounding note, clear pending | Host sends CC 123 on stop, pause, bypass, removal, cable delete |
| Never send the same note-on twice without a note-off between; if a step re-triggers a sounding pitch, send note-off at the same frame first | Some instruments count note-ons |
| Clamp pitch to 0..127, velocity to 1..127 | velocity 0 is a note-off |
| Same output for any block size | Both hosts call `process` with different block sizes |
| Seeded RNG (`Engine(rate, seed)`), seed saved in state | Random patterns replay the same after reload |

## Web adapter

Main thread, lookahead ticker (see [03](../03-web-host.md#adapter-shape-midi-plugins-main-thread-lookahead)). Out events:

```ts
function toEvent(k: number, time: number): PluginEvent {
  const b = core.<pfx>_out_bytes(engine, k);
  return { type: 'midi', time, bytes: [b & 0xff, (b >> 8) & 0xff, (b >> 16) & 0xff], port: 'out' };
}
```

## Parameters (typical)

| id | kind | range | notes |
| --- | --- | --- | --- |
| `rate` | choice | 1/4, 1/8, 1/16, 1/32, 1/8T, 1/16T | step length in beats |
| `gate` | float | 0.05..1 | note length as a fraction of the step |
| `swing` | float | 0..0.75 | delays every second step |
| `octaves` | int | 1..4 | arp range |
| `mode` | choice | up, down, up-down, random, as played | |
| `velocity` | int | 1..127 | |
| `root`, `scale` | choice | | for melody / chord generators |
| `seed` | int | 0..65535 | `automatable: false` |

## Done when

- [ ] Core test: 4 bars at 120 BPM, 1/16, gate 0.5 → exactly 64 note-on and 64 note-off, at the expected frames, for block sizes 1, 64, 128, 512, 4096.
- [ ] Core test: stop in the middle of a note → a note-off at the stop frame, nothing after.
- [ ] Core test: tempo change mid-bar → next steps on the beat grid of the new tempo.
- [ ] IvanDAW: Note hold → generator → sine synth → Master plays the pattern in time with the metronome; Stop leaves no hanging note.
- [ ] DAW checklist in [07](../07-checklists.md) for Logic (MIDI FX), Ableton (VST3 routing), FL Studio.
