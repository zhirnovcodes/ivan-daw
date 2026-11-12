# Web Plugin API & Chain Connectors

> Copy of the Claude Doc "Web Plugin API & Chain Connectors" (https://claude.ai/artifact/NzJsm1ShEFfY7Kg2JTi5E3), exported 2026-11-12. `ivandaw-core/src/api.ts` is generated from its Types section. Ask Ivan before changing this file.

Nov 10, 2026 · @Ivan

## Overview

Web DAW: tracks = chains of web plugins (add/remove/reorder). Contract = v2 of `hosts/web/plugin.ts` (v1 = current; Beatality and the rack LFO implement v1). Host owns all routing; plugins never talk to each other. Plugins = in-page ES modules; DSP in their own AudioWorklet / Web Audio nodes. v1 plugins and WAM 2.0 run via adapter.

Non-goals (v2):

- Plugins from third parties you do not control (no sandboxing, no permissions model).
- Recording audio, a full piano roll, or offline bounce.
- Multi-channel surround. Ports are mono or stereo.

## Topology

- Host: one AudioContext, transport, tracks, routing, plugin windows.
- Track: ordered slots → track gain/pan → master bus.
- Default wiring: track note input (keyboard, pads, Web MIDI, clips) → first slot accepting notes; `midi` slot event out → next slot; notes pass through slots that don't accept them; main audio out → next main audio in; bypassed slot skipped.
- Extra routes (user-drawn): sidechain audio, modulation binding (modulator → any parameter, any track; one source per parameter), cross-track events.
- Host refuses: audio or event cycles; a slot without audio in placed below an audio slot.

| kind | audio in | audio out | events in | events out |
| --- | --- | --- | --- | --- |
| instrument | none / sidechain | required | notes, controls | optional |
| effect | required | required | controls | optional |
| midi | - | - | notes, controls | notes |
| modulator | - | - | controls | modulation |
| utility | any | any | any | any |

## Types

```typescript
type PluginKind = 'instrument' | 'effect' | 'midi' | 'modulator' | 'utility'
type Feature = 'state' | 'presets' | 'sample-accurate' | 'latency' | 'tail'

interface PluginManifest {
  id: string                 // stable reverse-DNS: 'com.beatality.beatality'
  name: string; vendor: string
  version: string            // plugin semver
  apiVersion: 2
  kind: PluginKind
  ports: PortInfo[]          // fixed for the instance's life
  ui: { width: number; height: number; resizable: boolean } | null   // CSS px
  features: Feature[]
}

interface PluginFactory {    // default export of the plugin module; host lists modules in /plugins/catalog.json, loads via import()
  readonly manifest: PluginManifest
  create(host: HostContext, container: HTMLElement | null): Promise<PluginInstance>
}

interface HostContext {
  readonly audioContext: AudioContext
  readonly apiVersion: 2
  readonly slotId: string                       // unique in project
  transport(): TransportState                   // latest state, beat computed at currentTime of the call
  notify(level: 'info' | 'warning' | 'error', message: string): void
  markDirty(): void                             // project now unsaved
  assetUrl(path: string): string                // resolved against the module URL
}

interface PluginInstance {
  readonly ports: ReadonlyMap<string, PortHandle>
  readonly latency: number                      // s of added delay
  readonly tail: number                         // s of sound after input stops
  parameters(): ParameterInfo[]
  parameter(id: string): number                 // normalized 0..1
  schedule(events: PluginEvent[]): void         // event input
  listen(l: (e: PluginEvent) => void): () => void          // event output
  subscribe(l: (c: ParameterChange) => void): () => void
  getState(): Promise<PluginState>
  setState(s: PluginState): Promise<void>
  mount(container: HTMLElement): void
  unmount(): void
  suspend(): void
  resume(): void
  dispose(): void
}

type PortInfo =
  | { id: string; label: string; kind: 'audio'; direction: 'in' | 'out'; channels: 1 | 2; main: boolean }
  | { id: string; label: string; kind: 'events'; direction: 'in' | 'out'; accepts: EventType[] }
  | { id: string; label: string; kind: 'modulation'; direction: 'out' }

type PortHandle =
  | { info: PortInfo & { kind: 'audio' }; node: AudioNode; index: number }   // host: out.node.connect(in.node, out.index, in.index)
  | { info: PortInfo & { kind: 'events' | 'modulation' } }                     // host: listen() → schedule()

type EventType = 'midi' | 'automation' | 'tempo' | 'transport'
type PluginEvent = (
  | { type: 'midi'; time: number; bytes: [number, number, number] }        // raw MIDI channel message
  | { type: 'automation'; time: number; id: string; value: number;          // value 0..1
      source?: 'host' | 'binding' | 'clip' }
  | { type: 'tempo'; time: number; bpm: number }
  | { type: 'transport'; time: number; state: TransportState }
) & { port?: string }                                                       // omitted = main port

interface TransportState {
  playing: boolean; bpm: number
  beat: number                                  // beats from project start at event.time
  numerator: number; denominator: number
  loop: { start: number; end: number } | null   // beats
}

interface ParameterInfo {
  id: string                                    // stable forever (projects, bindings)
  label: string
  kind: 'float' | 'int' | 'boolean' | 'choice' | 'trigger'
  min: number; max: number; default: number     // default in min..max
  unit?: string
  scale?: 'linear' | 'log'                      // default linear
  choices?: string[]                            // labels for min..max
  group?: string
  automatable: boolean
  format?: (value: number) => string            // value in min..max
}

interface ParameterChange {
  id: string; value: number                     // normalized
  gesture?: 'begin' | 'end'                     // frames a drag = one undo step
  source: 'ui' | 'host' | 'binding' | 'internal'
}

interface PluginState {
  pluginId: string; pluginVersion: string
  data: unknown                                 // plugin-owned JSON, plugin-versioned
  files?: Record<string, Blob>                  // samples, IRs
}
```

## Rules

Lifecycle

- `create` resolves only when ready to play (wasm, worklet, samples loaded). Reject → slot shows error, stays in project for retry.
- `container` null = headless. Must work without UI. `mount`/`unmount` open/close the window; sound unchanged.
- Host disconnects all ports, then `dispose()`: stop timers, close worklet port, remove DOM, drop listeners.
- Bypass = host reroutes around slot and stops events. `suspend`/`resume` = plugin may idle.

Events

- `time` = audioContext seconds; ≤ now = ASAP. Host lookahead \~100 ms, batches every 25 ms, sorted by time.
- `sample-accurate`: apply at frame `Math.round(time * sampleRate)`. Otherwise apply on arrival.
- Note on velocity 0 = note off. CC 120/123 = silence all: release every sounding note and drop queued events at or after its time. Host sends CC 123 on stop, on pause, on bypass, before removal, and when a notes cable is removed.
- Emitted note on needs matching note off, including on CC 123 and dispose.
- DAW page controls: pads/keys → `midi`; knobs/sliders → `automation`. Same as hardware to the plugin.

Parameters

- Set only via `automation` event (timed with notes). Report every change via `subscribe` with `source`.
- `trigger` fires on rise past 0.5, reads back 0. `int`/`choice` round after denormalizing.
- Unknown id in `automation` → ignore, never throw.
- UI controls carry `data-param="<id>"` (host uses it for drag-to-bind, MIDI learn, highlight).
- Host builds a generic strip from `parameters()`: float knob, int stepper, boolean toggle, choice menu, trigger button. Used for UI-less plugins and the macro panel.

Transport

- Sent on every change (play, pause, stop, tempo, loop jump), and to a node added while playing. No periodic resend. `beat(t) = beat + (t - time) * bpm / 60`.
- Play: `playing: true` at start time. Stop: `playing: false`, then CC 123. Loop jump: new state with reset `beat`.
- `tempo` event = bpm only (v1 compat). Late joiners read `host.transport()`.

State and UI

- `getState` callable anytime, no sound change. `setState` releases held notes, resolves when it sounds as saved. Must read any older own version.
- Presets = named states. `presets` feature = plugin lists factory presets; host stores user presets.
- Render only inside container; scope styles (class prefix or shadow root). Size from `manifest.ui`; resizable → `ResizeObserver`.
- Stop key propagation only for keys the focused control uses (space = DAW play).

Errors and versioning

- Throws in `schedule`, listeners, `getState`: host catches, logs with `slotId`, shows once, keeps routing. Soft problems → `host.notify()`.
- Host supports current and previous `apiVersion`. Optional additions don't bump it; changed/removed members do.
- No `manifest` = v1 → adapter: `audioInput`/`audioOutput` → `in`/`out` ports, `onDrop` dropped (host reads `data-param`), `getState` = parameter values.

## Project file (host-owned)

```json
{"format":"webdaw.project","version":1,
 "transport":{"bpm":120,"numerator":4,"denominator":4},
 "tracks":[{"id":"t1","name":"Drums","gain":1,"pan":0,"slots":[
   {"id":"s1","plugin":"com.beatality.beatality","bypass":false,"state":"<PluginState>"}]}],
 "routes":[{"kind":"modulation","from":"s9:out","to":"s1","parameter":"globalChance"}]}
```

## Beatality

Current v1 implementation: `apps/web-widget/src/plugin.tsx`; parameters: `presenters/web/BeatalityParameters.ts` (\~40).

v2 manifest: kind `instrument`; ports `out` (audio, out, 2 ch, main) and `in` (events, accepts midi/automation/tempo/transport); ui `{width: 746, height: 0 (fit widget), resizable: false}`; features `state`, `presets`.

Input behaviour today

- Note on (any note, velocity > 0): gate opens, loop plays; velocity/127 × `volume`.
- Note off / velocity 0: gate closes when no held note is left.
- CC 120/123: all off. Other CC, pitch bend: ignored (host should map them to `automation`).
- `automation`: sets a parameter. `tempo`: project tempo, used while BPM sync is on.
- `time` ignored: events applied on arrival.

To reach v2

- [ ] Add `manifest`; move `audioOutput` to port `out`.
- [ ] Fill `default`, `unit`, `group`; `randomize` and `shuffle` → `kind: 'trigger'`.
- [ ] `getState`/`setState` from `preset()` and `loadDocument()`: `PackDocument` → `data`, samples → `files`.
- [ ] Pass event times to the worklet; declare `sample-accurate`.
- [ ] Handle `transport` (lock loop to bar when synced); split `mount`/`unmount` from `create`.

## Open questions

- [ ] Lookahead 100 ms, or host-side timer for non-sample-accurate plugins (simpler, 5–15 ms jitter)?
- [ ] One worklet per plugin (simpler) or one shared host worklet (less CPU at 10+ slots)?
- [x] Modulation as `automation` events (time + value), smoothed in the plugin. Decided 2026-11-12.
- [ ] Third-party plugins later → iframe / `postMessage` boundary?
- [ ] MIDI out from Beatality (e.g. beat-repeat triggers) to drive other plugins?
