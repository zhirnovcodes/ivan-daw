# Type · MIDI control

Makes control values that move other plugins' parameters: LFO, sliders / macros, step modulator, envelope follower from notes, random (sample & hold). Takes transport (and optionally notes) in, sends control values out. No audio.

Read first: [01-architecture.md](../01-architecture.md). Host details: [03](../03-web-host.md), [04](../04-vst-host.md).

## One core value, two outputs

The core pushes `OutEvent{ kind: Control, slot, value }` with `value` in 0..1. Each host turns it into what it understands:

| Host | Becomes | Target picked by |
| --- | --- | --- |
| IvanDAW | `automation` event on modulation port `out-<slot>` | the user drawing a control cable to any parameter / volume / pan |
| VST3 / AU | MIDI CC on `channel`, controller `cc<slot>` | the user MIDI-learning the target plugin's knob, or the DAW's MIDI-mapping |

DAW plugins cannot set another plugin's parameter directly. MIDI CC is the portable way; every DAW listed in [04](../04-vst-host.md#daw-compatibility) can route plugin MIDI out to an instrument that MIDI-learns.

## IvanDAW manifest

```ts
export const manifest: PluginManifest = {
  id: '<id>', name: '<Name>', vendor: 'zhirnovcodes', version: VERSION, apiVersion: 2,
  kind: 'modulator',
  ports: [
    { id: 'in', label: 'Transport', kind: 'events', direction: 'in', accepts: ['transport', 'tempo', 'automation', 'midi'] },
    { id: 'out-0', label: 'A', kind: 'modulation', direction: 'out' },
    { id: 'out-1', label: 'B', kind: 'modulation', direction: 'out' },
  ],
  ui: { width: 360, height: 200, resizable: false },
  features: ['state'],
};
```

Output count is fixed for the instance's life. Choose it at design time (1–8).

## Web adapter

Same lookahead ticker as the generator (see [03](../03-web-host.md#adapter-shape-midi-plugins-main-thread-lookahead)). Same event shape as ivan-daw's `lfo` and `control-sliders` plugins:

```ts
function toEvent(k: number, time: number): PluginEvent {
  const port = `out-${core.<pfx>_out_slot(engine, k)}`;
  return { type: 'automation', time, id: port, value: core.<pfx>_out_value(engine, k), port };
}
```

ivan-daw's router replaces `id` with the target parameter and smooths in the target plugin.

## JUCE

Same two targets as the generator (`<Name>` VST3 + Standalone with MIDI out; `<Name>MidiFx` AU MIDI FX). In `processBlock`:

```cpp
juce::MidiMessage controlToCc(const <pfx>::OutEvent& e) const {
    const int ch = channel();                 // params.json "channel", 1..16
    const int cc = ccNumber(e.slot);          // params.json "cc0", "cc1", ... 0..119
    return juce::MidiMessage::controllerEvent(ch, cc, juce::jlimit(0, 127, (int)std::lround(e.value * 127.0f)));
}
```

Rules for CC output:

- Send a CC only when its 7-bit value changes (avoid flooding the MIDI bus).
- Never use CC 120–127 (channel mode messages).
- Optional per-slot `hires` boolean: send 14-bit CC (MSB on `cc`, LSB on `cc + 32`) for slow, smooth sweeps. Only for `cc` 0..31.

## Core behaviour

- Rate of control events: one per `controlStep` frames (default 64 frames ≈ 1.5 ms at 44.1 kHz), plus one immediately on any parameter change. The web adapter thins to one per 5 ms (`automation` is smoothed by the receiver); JUCE thins by the "only on change" rule above.
- Beat-synced shapes (LFO) compute phase from `beatAt(frame)`, never by accumulating, so they stay locked after loops and tempo changes. ivan-daw's `plugins/lfo/src/lfo.ts` `wave(beat)` is the model.
- Free-running shapes (Hz rate) accumulate phase in frames.
- Sliders / macros: on a parameter change, push its value at frame 0 of the next block.
- Stop: hold the last value (do not jump to 0). Optional `resetOnStop` parameter.

## Parameters (typical)

| id | kind | range | notes |
| --- | --- | --- | --- |
| `shape` | choice | sine, triangle, saw, square, S&H | LFO |
| `rate` | choice | 4 bars … 1/32, or `sync` off | |
| `hz` | float, log | 0.01..20 Hz | when sync is off |
| `depth`, `offset` | float | 0..1 | output = offset + depth × (shape − 0.5), clamped 0..1 |
| `phase` | float | 0..1 | |
| `a`, `b`, … | float | 0..1 | sliders / macros, one per output |
| `channel` | int | 1..16 | JUCE only, `automatable: false` |
| `cc0`, `cc1`, … | int | 0..119 | JUCE only, `automatable: false`; defaults 20, 21, … (undefined CCs) |

IvanDAW ignores `channel` and `ccN` (no harm in showing them in its generic strip; mark them `group: "MIDI"`).

## Done when

- [ ] Core test: LFO 1 cycle/bar, 120 BPM → value 0.5 at beat 0, max at beat 1, 0.5 at beat 2, min at beat 3, for every block size.
- [ ] Core test: loop jump to beat 0 → phase resets on that frame.
- [ ] IvanDAW: control cable from `out-0` to Beatality or sine synth volume; it moves once per bar and follows BPM changes.
- [ ] Ableton / FL Studio: MIDI out routed to a synth that MIDI-learns CC 20 → the knob moves with the LFO.
- [ ] Logic: MIDI FX slot, target instrument's knob learns CC 20 (Smart Controls learn or the plugin's own learn).
