# IvanDAW — v1 Tech Design

> Copy of the Claude Doc "IvanDAW — v1 Tech Design" (https://claude.ai/artifact/J5btFKteSBDBfpWHT3ouMq), exported 2026-11-12. The Claude Doc is the source of truth; ask Ivan before changing this file.

Nov 11, 2026 · @Ivan

This is the host design that P2 turns into code. v1 is a node graph in the browser, running on localhost. A note generator plays C3 on every beat into a sine synth, the synth plays into Master, and the user can drag nodes and edit cables. The host owns routing, timing and the project. Plugins only implement the Web Plugin API v2 and never talk to each other.

## Terms

Every term this doc uses, A to Z.

| Term | Meaning |
| --- | --- |
| Anchor | The pair "beat B happens at time T". With the BPM, every other beat's time follows: time = T + (beat − B) × 60 / BPM. A new anchor is taken on Play, Pause and every BPM change. |
| Attack / release | The short fade-in at the start of a sound and the fade-out at its end. |
| AudioContext | The browser's audio engine. Its clock (`currentTime`, in seconds) is the only clock the DAW uses. |
| AudioParam | A value on a Web Audio node (gain, pan) that the browser can ramp smoothly, sample by sample. |
| AudioWorklet | The browser's audio thread. A plugin's own sample code runs there in blocks of 128 samples. |
| Beat / bar | A beat is one quarter note; a bar is 4 beats (4/4). |
| BPM | Beats per minute, 40–240. |
| Cable | A user-drawn link from an output port to an input port. |
| Catalog | The list of available plugins, served at `/plugins/catalog.json`. |
| CC 123 (All Notes Off) | A standard MIDI message, bytes `[0xB0, 123, 0]`. It tells an instrument to release every note now. Sent on Stop, Pause and when a notes cable is removed. |
| Click | An audible pop from a sudden jump in the waveform. Short fades prevent it. |
| Control | A stream of values that drives one parameter: an LFO, music hands, a MIDI knob. Not in v1. |
| DOM box | A node drawn as an ordinary HTML element (a `div`), so text, buttons and dragging work like any web page. |
| Envelope | A gain curve 0 → 1 → 0 that shapes the start and end of a sound. Beatality's `Curve`, renamed. |
| Event | A timed message (`midi`, `automation`, `tempo`, `transport`) with `time` in AudioContext seconds. |
| Host | The DAW itself: everything except the plugins. |
| Lookahead | How far ahead notes are booked: 100 ms. |
| Master | The built-in node where all sound ends and goes to the speakers. |
| Note on / note off | MIDI messages `[0x90, note, velocity]` and `[0x80, note, 0]`. Note 60 is C3. |
| Node | One box on the canvas: a plugin instance or Master. |
| Parameter | A named value of a plugin, such as the sine synth's `level`, stored as 0..1. |
| Plugin | A separately built module that implements Web Plugin API v2. |
| Port | A typed input or output on a node, declared by the plugin's manifest. |
| Ramp | A gradual change of an AudioParam over a set time. |
| Router | The host part that turns cables into real audio connections and forwards events. |
| Scheduler | The musical clock: Play, Pause, Stop, BPM. |
| Signal | A reactive value (@preact/signals). Code that reads it re-runs when it changes. |
| Smoother | Moves a value to a new target over 5 ms instead of jumping. Beatality's `Interpolator`. |
| Store | Holds the project in signals; only its actions change it. |
| Strip | The host's volume and pan stage after a node's main audio output. |
| SVG layer | One transparent SVG drawing stretched over the canvas, behind the node boxes. Each cable is a curved path in it. |
| Ticker | A timer in a Web Worker that wakes the scheduler every 25 ms. Background tabs don't slow Worker timers. |
| Transport | The play state (playing, paused, stopped), the BPM and the current beat. |
| Voice | One sounding note inside the synth. The sine synth has 8. |

## Summary and scope

| In v1 | Not in v1 |
| --- | --- |
| Canvas with draggable nodes and editable cables | Zoom, save / load, URL presets, undo |
| Play / Pause / Stop, BPM 40–240, CC 123 on pause and stop | Recording, piano roll, bounce |
| Per-node volume and pan; generic parameter controls | Plugin windows (no v1 plugin has a UI) |
| Built-in Master; plugins: note generator, base sine synth | Beatality, LFO, control cables, effects, v1 adapter |
| Chrome, Firefox, Safari on desktop, localhost | Phone site, hosting, C++/wasm |

Repos and folders

- [zhirnovcodes/ivan-daw-core](https://github.com/zhirnovcodes/ivan-daw-core) (package name `ivandaw-core`): `src/api.ts` (API v2 types), `src/transport.ts` (timing math + lookahead loop), `src/midi.ts`, `src/envelope.ts`.
- [zhirnovcodes/ivan-daw](https://github.com/zhirnovcodes/ivan-daw): `apps/daw/src/{contracts, model, store, engine, scheduler, router, canvas, panels, app}`, `apps/daw/e2e`, `plugins/note-gen`, `plugins/base-sine-synth`.

## Architecture

The host has three layers:

- UI (canvas, panels) only reads signals and calls actions.
- The store holds the project.
- Scheduler, router and engine react to the store and own everything audio.

Plugins sit at the bottom and hear from the host only through `schedule()`, and talk back only through `listen()`.

```text
Canvas, Panels --read signals / call actions--> Store (project)
Store --effect()--> Engine, Scheduler, Router
Scheduler --transport events--> Router --schedule()--> every plugin
note-gen --listen()--> Router --schedule() along the cable--> base-sine-synth
base-sine-synth --audio--> strip (gain, pan) --> cable gain --> Master --> speakers
ivandaw-core (api types, transport math, midi, envelope) is used by the host and every plugin
```

The note generator never calls the synth: its notes go up to the router, which forwards them along the cable. That is why any generator can drive any instrument.

## Elements

v1 has 14 elements. Each one has a single owner folder, and it talks to the others only through the contracts in `src/contracts` and `ivandaw-core`.

| Element | What it does | Owner folder | Talks to |
| --- | --- | --- | --- |
| Project | The document: transport settings, nodes, cables | src/model | everything reads it |
| Store | Holds the project in signals; the only place that changes it (actions) | src/store | UI calls actions; engine, router, scheduler react |
| Engine | Owns the AudioContext, Master and strips; loads and disposes plugin instances | src/engine | store (nodes), router (audio nodes), plugins |
| Master | Built-in node: sums all audio, master gain, meter, speakers | src/engine | router connects into it |
| Strip | Per-node gain → stereo pan after the node's main audio out | src/engine | router connects from it |
| Scheduler | The clock: Play / Stop / BPM, broadcasts transport events | src/scheduler | store (play, stop, bpm), router (fan-out) |
| Router | Validates cables, plans the wiring, applies it, forwards events | src/router | store, engine, scheduler, plugins |
| Canvas | Draws nodes, ports and cables; drag, connect, delete, select | src/canvas | store (read + actions), router (validate) |
| Transport bar | Play / Stop button, BPM field, Space key | src/panels | store |
| Node panel | Selected node: volume, pan, parameters, remove | src/panels | store, engine (parameters) |
| Add-node menu | Lists the catalog, adds a node | src/panels | store, catalog |
| Catalog | List of available plugins, built by the dev server | src/model + dev plugin | engine, add-node menu |
| Note generator | Plugin, kind `midi`: C3 on every beat | plugins/note-gen | host via the plugin API only |
| Base sine synth | Plugin, kind `instrument`: one sine voice per note | plugins/base-sine-synth | host via the plugin API only |

## Ports and cables

A cable runs from an output port to an input port of the same kind. An input takes one cable, except Master's input, which sums any number. Ports come from the plugin's manifest and never change while the node exists.

| Port kind | Carries | Inputs per node | Cable look | v1 ports |
| --- | --- | --- | --- | --- |
| `audio` (1 or 2 channels) | Sound | One per audio input | solid | sine `out`, Master `in` |
| `events` (notes) | Note on / off, timed one by one | One notes input | dashed | note-gen `out`, sine `in` |
| `modulation` (control) | A stream of values for one parameter | One per automatable parameter | dotted | none until v1.2 |

Notes and control are different things. A note starts, ends and needs a voice. Control is one value that keeps changing, aimed at one parameter. An LFO, music hands moving a pitch and a MIDI knob (CC) all produce control, and the parameter can't tell which one drives it.

So every automatable parameter is a control input. A plugin has one notes input but as many control inputs as it has parameters: the sine synth has `level` now, and later could add pitch, volume and pan. Music hands that play notes use a notes output; music hands that bend pitch use a control output.

Control delivery (built in v1.2): control arrives as `automation` events (time + value), the same path as a node panel slider, and the plugin smooths them with a Smoother.

Cable rules, checked by `Router.validate` in this order (the first failure is the refusal reason):

| # | Rule | Refusal reason |
| --- | --- | --- |
| 1 | From and to are different nodes | `self` |
| 2 | From is an `out` port, to is an `in` port | `direction` |
| 3 | Same port kind; for events, the out port's types and the in port's `accepts` share at least one type | `kind` |
| 4 | No identical cable already exists | `duplicate` |
| 5 | The new cable creates no cycle in the combined audio + events graph | `cycle` |

One output can feed several inputs: the same sound or notes go to each. An input takes one cable: dropping a new cable on a taken input replaces the old one, with a 10 ms crossfade. Master `in` is the only input that sums several cables.

No hidden links: a node is heard only through cables. When an instrument is added from the menu, the host also creates a real cable from its main out to Master, so it is heard at once. Deleting that cable silences it.

Transport is not cabled: the router sends `transport` and `tempo` events to every node, whatever its ports.

## Project model and store

The project is one plain JSON object held in a signal. UI code never edits it directly: it calls actions, and each action replaces the whole object, keeping the previous one immutable. Engine, router and scheduler react to the signal with `effect()`.

```typescript
// src/model/project.ts
interface Project {
  format: 'ivandaw.project'; version: 1
  transport: { bpm: number; numerator: number; denominator: number }   // v1: 120, 4, 4
  nodes: GraphNode[]
  cables: Cable[]
}
interface GraphNode {
  id: string                        // 'n1', 'n2'…; Master is always 'master'
  plugin: string                    // manifest id, or 'builtin.master'
  x: number; y: number              // canvas px, top-left of the node box
  gain: number                      // strip volume 0..1.5, default 1
  pan: number                       // strip pan -1..1, default 0
  bypass: boolean                   // v1: always false (no UI yet)
  params: Record<string, number>    // normalized 0..1, keyed by ParameterInfo.id
}
interface PortRef { node: string; port: string }
interface Cable { id: string; from: PortRef; to: PortRef }   // 'c1', 'c2'…
```

```typescript
// src/store/store.ts
const project   = signal<Project>(demoProject)
const selection = signal<{ node?: string; cable?: string }>({})
const playing   = computed(() => scheduler.state.value.playing)
const nodeStatus = signal<Record<string, 'loading' | 'ready' | 'error'>>({})

// src/store/actions.ts — the only writers
addNode(plugin: string, x: number, y: number): string
moveNode(id: string, x: number, y: number): void           // called on every pointermove while dragging
removeNode(id: string): void                                 // also removes its cables; refuses 'master'
connect(from: PortRef, to: PortRef): { ok: true; id: string } | { ok: false; reason: RefuseReason }
disconnect(cableId: string): void
setGain(id: string, v: number): void
setPan(id: string, v: number): void
setParam(id: string, param: string, v: number): void
setBpm(bpm: number): void                                    // clamped 40..240
play(): void; pause(): void; stop(): void                    // forward to the scheduler
select(sel: { node?: string; cable?: string }): void
```

Rules

- Ids come from counters that never reuse a number, so a removed `n3` is never confused with a new node.
- `connect` calls `Router.validate` first and returns the refusal reason. The canvas uses that reason for its feedback.
- `params` holds only values the user changed. When a node loads, the engine sends them to the plugin as `automation` events.
- No persistence in v1: the app boots from `public/projects/demo.json`.

## Engine

The engine is the only code that creates audio objects. It keeps one live `LoadedNode` per project node, adding and removing them as the project's node list changes.

AudioContext

- Created once at boot with `latencyHint: 'interactive'`, so it starts suspended (browser autoplay rule).
- `unlock()` runs on the first pointerdown or keydown anywhere and calls `context.resume()`. Play also awaits it, which covers Safari.
- Plugins load while the context is suspended, so their worklets are ready before the first Play.

Master (`builtin.master`, id `master`, always present, cannot be removed)

- Graph: `in` (GainNode, the summing point) → master gain (GainNode, default 0.8) → AnalyserNode (meter for the test hook) → `context.destination`.
- One input port `in` (audio, 2 ch, main). No outputs on the canvas.

Strip, one per node with a main audio out

- Plugin main out → GainNode (`node.gain`) → StereoPannerNode (`node.pan`) → wherever the router connects it.
- Volume and pan changes use `setTargetAtTime(v, now, 0.01)`, so dragging a slider never clicks.

Loading a node (effect on `project.nodes`)

1. New id → `nodeStatus[id] = 'loading'`. Look up `node.plugin` in the catalog, then `import(url)` and read the default export as `PluginFactory`.
2. Check `manifest.apiVersion === 2`. Then call `factory.create(hostContext(id), null)`; v1 plugins have no UI, so the container is always null.
3. Build the strip, store `{ instance, manifest, strip }`, send stored `params` as `automation` events, then set the status to `'ready'`.
4. Any failure → `'error'` plus a message. The node stays in the project and the canvas shows it red.
5. Removed id → the router disconnects everything first, then `instance.dispose()`, and the strip is disconnected.

HostContext given to each plugin

| Member | v1 behaviour |
| --- | --- |
| `audioContext` | The one shared context |
| `apiVersion` | 2 |
| `slotId` | The node id |
| `transport()` | `scheduler.state.value` |
| `notify(level, msg)` | `console[level]` + a small toast on the canvas |
| `markDirty()` | No-op (no saving in v1) |
| `assetUrl(path)` | `new URL(path, moduleUrl).href` |

```typescript
interface Engine {
  readonly context: AudioContext
  readonly master: AudioNode
  unlock(): Promise<void>
  get(id: string): LoadedNode | undefined
  rms(): number                          // from Master's analyser, for the test hook
}
interface LoadedNode { instance: PluginInstance; manifest: PluginManifest; strip?: { input: GainNode; output: StereoPannerNode } }
```

## Scheduler and transport

The scheduler is the musical clock. It never makes sound itself: it emits `transport` and `tempo` events with exact AudioContext times, and the router sends them to every node. All timing math comes from `ivandaw-core` (C2), the same functions the note generator uses.

Clock

- Time is always `audioContext.currentTime` seconds, never `Date.now()`.
- The ticker is `createTicker(25)` from ivandaw-core: a tiny Web Worker that wakes the scheduler every 25 ms (the argument is milliseconds). Browsers slow down main-thread timers in background tabs, but not Worker timers.
- Lookahead: each tick books everything due in `[now, now + 0.1 s)`.
- Anchor: `{ state: TransportState, time }`, meaning "beat `state.beat` happens at `time`". `beatAt(t) = state.beat + (t − time) × bpm / 60`, and `timeAt` is the reverse.

Why book notes ahead: JavaScript timers fire 1–20 ms late, more when the page is busy, so a note played "when the timer fires" would wobble. The audio clock is exact. So each tick books the next 100 ms of notes at exact audio times, and the browser plays them on the sample. A tick can be up to 75 ms late before a note is missed. Each plugin remembers the last beat it booked, so the overlap between ticks never books a note twice.

Behaviour

| User action | What the scheduler emits | Notes |
| --- | --- | --- |
| Play (from stopped) | `transport {playing: true, beat: 0, bpm, …}` at `t0 = now + 0.05` | Awaits `engine.unlock()` first |
| Play (from paused) | `transport {playing: true, beat: pausedBeat, bpm, …}` at `now + 0.05` | Continues where it paused; the first note is the next whole beat |
| Pause | `transport {playing: false, beat: beatAt(now)}` at `now`, then CC 123 to every node | Keeps the position; notes release |
| Stop | `transport {playing: false, beat: 0}` at `now`, then CC 123 to every node | Rewinds to beat 0; notes release. Stop while paused just rewinds |
| BPM change | `tempo {bpm}` + `transport {playing, beat: beatAt(now), bpm}` at `now` | New anchor: the beat stays continuous, and only the speed changes |
| Node added while playing | The router sends it the current anchor as a `transport` event at `now` | So it joins in time |

No transport resend every bar. The API doc sends it once per bar as a safety net for a plugin that joins late or misses a message. Here the router hands every new node the current anchor, and plugins compute every beat from the anchor exactly, so the resend adds nothing. It was removed from the API rules on 2026-11-12.

```typescript
interface Scheduler {
  readonly state: ReadonlySignal<TransportState>       // beat refreshed each tick, for the UI
  readonly anchor: ReadonlySignal<{ state: TransportState; time: number }>
  play(): Promise<void>; pause(): void; stop(): void; setBpm(bpm: number): void
  onEvent(l: (e: PluginEvent) => void): () => void    // router subscribes and fans out
}
```

`HostContext.transport()` returns the state with `beat` computed at the moment it is called.

Debug click: with `?click=1` in the URL, the scheduler also plays a 20 ms, 1 kHz blip into Master on every beat. That is the P4 listening check, before any plugin exists.

## Router

The router turns cables into real connections. It has three steps:

- `validate` and `plan` are pure functions with no audio objects, so they are fully unit-tested.
- `apply` is the only step that touches Web Audio.
- Event forwarding is a lookup table, rebuilt every time the plan changes.

```typescript
interface Router {
  validate(p: Project, manifests: ManifestMap, from: PortRef, to: PortRef):
    { ok: true } | { ok: false; reason: 'self' | 'direction' | 'kind' | 'duplicate' | 'cycle' }
  plan(p: Project, manifests: ManifestMap): Wiring          // pure
  apply(prev: Wiring, next: Wiring): void                   // diff onto the engine
}
interface Wiring {
  audio: { id: string; from: PortRef; to: PortRef }[]
  events: { id: string; from: PortRef; to: PortRef }[]
}
```

Plan (runs when cables, nodes or node status change)

- Keep only cables whose two nodes are `ready`, so a loading or broken node is simply skipped.
- No implicit links: the wiring is exactly the cables in the project.

Apply audio

- Each audio edge gets its own small GainNode (the cable gain): source → cable gain → target port node.
- The source is the node's strip output for a main out, otherwise `ports.get(id).node`.
- Connect: the cable gain ramps 0 → 1 over 10 ms. Remove: it ramps 1 → 0 over 10 ms, then disconnects after 20 ms. Replacing a cable on a taken input does both at once, a crossfade. See Fades and clicks.

Forward events

- On load, the router subscribes to `instance.listen()` on every node that has an events out port.
- Each emitted event is looked up in the table `fromNode:fromPort → [toNode:toPort]` and passed to `target.instance.schedule([{ ...e, port: toPort }])` unchanged. The router never re-times events.
- Removing an events cable sends CC 123 to the old target, so no note hangs.
- Transport and tempo from the scheduler go to every ready node's `schedule()`, with no cable needed.
- A plugin that throws inside `schedule` or a listener is caught. The error is logged with its node id and shown once as a toast, and routing continues.

## Fades and clicks

Every place where sound starts, stops or changes gets a short fade, because a sudden jump in the waveform is heard as a click. Three tools do it. The first two come from Beatality and move to `ivandaw-core/src/envelope.ts`, so every plugin reuses them.

| Tool | Runs in | What it does | From Beatality |
| --- | --- | --- | --- |
| Envelope | The plugin's worklet, one per voice | Gain rises 0 → 1 over the attack and falls to 0 over the release. A release starts from the gain reached, not from 1. A restart during a release rises from the gain reached, so nothing jumps. | `Curve` (renamed) |
| Smoother | The plugin's worklet, one per parameter | Moves a value to a new target in a straight line over 5 ms. A new target mid-move starts from where the value is. | `Interpolator` |
| AudioParam ramp | Host GainNodes: strip, cable gain, Master | `cancelAndHoldAtTime(t)`, then `linearRampToValueAtTime(v, t + d)`. The browser's own Smoother. | – |

| Case | What fades | Length |
| --- | --- | --- |
| A note starts or ends | That voice's Envelope | 5 ms attack, 30 ms release |
| Stop or Pause | CC 123: every voice releases from its current gain, and queued notes are dropped | 30 ms |
| Stop and Play at the same moment, or Play during a release | Old voices finish their release while new notes start on free voices with a normal attack. The two overlap instead of cutting | 30 ms out, 5 ms in |
| A 9th note when all 8 voices are busy | The oldest voice moves to an outgoing list and fades out; the new note starts at once | 5 ms |
| Instrument disconnected (audio cable removed) | The cable gain ramps to 0, then the cable disconnects | 10 ms, disconnect at 20 ms |
| Notes cable removed | CC 123 to the instrument, so its notes release | 30 ms |
| Audio cable added | The cable gain ramps 0 → 1 | 10 ms |
| Cable replaced on a taken input | Old cable fades out while the new one fades in | 10 ms |
| Node removed | Strip gain ramps to 0, then disconnect and `dispose()` | 10 ms, dispose at 20 ms |
| Volume, pan or parameter change | AudioParam ramp in the host, Smoother in the plugin | 5 ms |
| BPM change | Nothing: each note keeps its own envelope | – |

Tests: `envelope.ts` gets Vitest cases for a release from mid-attack, a restart from mid-release and a steal overlap. No case may jump by more than one attack step between samples.

## Canvas

The canvas is a full-window area under the transport bar. Each node is a DOM box: a plain HTML `div` placed with `transform: translate(x, y)`, so its text, buttons and dragging work like any web page. Behind the boxes, one transparent SVG layer covers the canvas and draws every cable as a curved path. Canvas pixels equal screen pixels, because there is no zoom or pan in v1.

Node box

- 180 px wide. The header shows the plugin name, and a status dot: grey while loading, red on error.
- Input ports sit on the left edge and output ports on the right. Each is a 12 px circle with its label, filled for audio and outlined for events.
- Master has no header menu and no remove action.

Cables

- A cubic Bézier from the out port's centre to the in port's centre, with control points 80 px horizontally out from each end.
- Audio cables are solid, notes cables are dashed and control cables (v1.2) will be dotted.
- Each cable also gets an invisible 12 px-wide copy, so it is easy to hit with the mouse.

Interactions

| Gesture | Result |
| --- | --- |
| Drag a node's header | `moveNode` on every pointermove (pointer capture); the box stays inside the canvas bounds |
| Click a node | `select({node})`; the node panel shows it |
| Press on an out port and drag | A temporary cable follows the pointer. Valid inputs (per `Router.validate`) glow; invalid ones dim |
| Release over a valid input | `connect(from, to)` |
| Release elsewhere or over an invalid input | The temporary cable disappears; an invalid drop shows the reason for 2 s ("would create a loop") |
| Click a cable | `select({cable})`; the cable thickens and an × appears at its midpoint |
| Click ×, or press Delete / Backspace with a cable selected | `disconnect(id)` |
| Delete / Backspace with a node selected | `removeNode(id)`, except Master |
| Click empty canvas or press Escape | Clear the selection |

The canvas reads `project`, `selection` and `nodeStatus` signals and calls actions, nothing else. It never touches audio.

## Panels

The screen has three panels and the canvas. All of them use black text on white in the system font, with no theming. They read signals and call actions; only the node panel also reads a plugin's `parameters()`.

```text
+--------------------------------------------------------------+
| [Play] [Stop]  BPM [120]   beat 3.2              [+ Add]     |  transport bar, 48 px
+-----------------------------------------------+--------------+
|                                               | Node panel   |
|   canvas                                      | 260 px,      |
|                                               | when a node  |
|                                               | is selected  |
+-----------------------------------------------+--------------+
```

Transport bar

- Play / Pause is one button, and Stop is a second one. Space toggles Play / Pause unless focus is in a text field.
- BPM is a number field from 40 to 240. It commits on Enter or blur, the arrow keys step by 1, and Shift + arrow steps by 10. It calls `setBpm`.
- A beat readout (`bar.beat`) shows from `scheduler.state`, so you can see that the clock runs.
- `+ Add` opens the add-node menu.

Node panel (selected node)

- Title: the plugin name and kind. Status and error message if not ready.
- Volume slider (0–1.5, shown in dB) and Pan slider (L–R, double-click resets to centre) → `setGain` / `setPan`.
- Generic parameter strip, one control per `ParameterInfo` where `automatable` is true:
  - `float` → slider; `int` → stepper; `boolean` → toggle; `choice` → menu; `trigger` → button.
  - Each change → `setParam` (stored) + an `automation` event at `now` to the instance.
  - Labels use `format(value)` when the plugin provides it.
- Remove button (hidden for Master).

Add-node menu

- Lists the catalog entries by name and kind.
- Clicking an entry calls `addNode(id, x, y)`. The new node goes at the canvas centre, offset 24 px for each node already at that spot, and becomes selected. For an instrument, the same action also creates a cable from its main out to Master.

## Plugins

Both v1 plugins are plain API v2 modules with no UI. The host shows their parameters in the generic strip. They know nothing about the canvas, the router or each other.

### Note generator — `com.ivandaw.note-gen`

| Manifest field | Value |
| --- | --- |
| kind | `midi` |
| ports | `out`: events, out, emits `midi` |
| ui | `null` |
| features | `state` |
| parameters | none in v1 |

Behaviour (main thread only, no audio)

1. Every `transport` event it receives through `schedule()` becomes its anchor (state + event time).
2. When the anchor says `playing: true`, it starts `createTicker(25)`. Each tick it uses `lookaheadWindow(now)` and emits, for every whole beat `n` in the next 100 ms that it hasn't emitted yet:
   - note on: `[0x90, 60, 100]` at `timeAt(n)`;
   - note off: `[0x80, 60, 0]` at `timeAt(n + 0.5)`.
3. It remembers the last beat emitted, so overlapping ticks and BPM changes never double a note. After a resume from pause, the first note is the next whole beat after the paused beat.
4. On `playing: false` or CC 123 it stops the ticker. If a note is still open, it emits its note off at the stop time.
5. `getState` returns `{}` and `setState` does nothing. `dispose` stops the ticker and drops its listeners.

### Base sine synth — `com.ivandaw.base-sine-synth` (throwaway)

| Manifest field | Value |
| --- | --- |
| kind | `instrument` |
| ports | `in`: events, accepts `midi`, `automation`, `transport`, `tempo`; `out`: audio, out, 2 ch, main |
| ui | `null` |
| features | `sample-accurate`, `state` |
| parameters | `level`: float 0–1, default 0.5, shown in dB |

Behaviour

- One AudioWorklet node, with its code in TypeScript. `schedule(events)` converts each event to `frame = Math.round(time × sampleRate)` and posts it to the worklet. The worklet keeps a sorted queue and splits each 128-sample block at event frames.
- 8 voices, each with an Envelope from ivandaw-core. A note on starts a sine at `440 × 2^((n − 69) / 12)` with a 5 ms attack. A note off starts a 30 ms release. When all 8 are busy, the oldest voice moves to an outgoing list and fades out over 5 ms while the new note starts.
- Output: the sum of voices × `level` × 0.25 (headroom), the same signal on both channels.
- CC 120 / 123: every voice starts its 30 ms release from its current gain, and queued events at or after that frame are dropped. `level` changes go through a 5 ms Smoother.
- The DSP (oscillator, envelope, voice allocation) lives in a plain `dsp.ts` with no browser types, so Vitest can test it directly.

## ivandaw-core API (v0.1.0)

`ivandaw-core` is the only place the plugin API types are defined, and the host and every plugin import them from here. It has no runtime dependencies and only small pure functions, plus one worker-based ticker.

```typescript
// src/api.ts — copied from "Web Plugin API & Chain Connectors", Types section, unchanged:
export type { PluginKind, Feature, PluginManifest, PluginFactory, HostContext, PluginInstance,
  PortInfo, PortHandle, EventType, PluginEvent, TransportState, ParameterInfo,
  ParameterChange, PluginState }

// src/transport.ts
export interface Anchor { state: TransportState; time: number }        // state takes effect at `time`
export function beatAt(t: number, a: Anchor): number                  // a.state.beat + (t - a.time) * bpm / 60
export function timeAt(beat: number, a: Anchor): number               // inverse of beatAt
export function lookaheadWindow(now: number, ahead = 0.1): [number, number]
export function beatsIn(window: [number, number], a: Anchor): number[]   // whole beats with timeAt in [from, to)
export function createTicker(ms: number, tick: () => void): { stop(): void }   // Web Worker interval

// src/midi.ts
export const noteOn  = (note: number, vel: number, ch = 0): [number, number, number]
export const noteOff = (note: number, ch = 0): [number, number, number]
export const allNotesOff = (ch = 0): [number, number, number]          // CC 123
export function parse(bytes: [number, number, number]):
  { type: 'noteOn' | 'noteOff' | 'cc' | 'other'; note?: number; vel?: number; cc?: number; value?: number }
export const noteToHz = (n: number) => 440 * 2 ** ((n - 69) / 12)
export const NOTE = { C3: 60 } as const                                // Ableton naming: C3 = MIDI 60

// src/envelope.ts — ported from Beatality Curve and Interpolator, per-sample, no allocation
export class Envelope { constructor(attackFrames: number, releaseFrames: number)
  start(): void; release(): void; next(): number; readonly done: boolean }   // start/release continue from the current gain
export class Smoother { constructor(value: number, frames: number)
  set(target: number): void; next(): number }                            // straight line to target, retargets from current value
```

Release rule: every change gets a semver tag. `ivandaw` pins an exact tag, and a breaking type change bumps the minor version while it is still 0.x.

## Plugin loading and the catalog

The DAW finds plugins at runtime through `/plugins/catalog.json` and loads each one with `import(url)`. It never imports plugin code at build time. So a plugin stays a separate module, exactly as an external plugin will be later.

Plugin package layout (`plugins/<name>/`)

```text
package.json        name, version, "ivandaw": { "id": "com.ivandaw.note-gen" }
src/index.ts        default export: PluginFactory (manifest + create)
src/worklet.ts      AudioWorkletProcessor (sine synth only)
src/dsp.ts          pure DSP, unit-tested (sine synth only)
src/test-page.html  standalone page: load the plugin, play notes by key, no DAW needed
vite.config.ts      library mode → dist/index.js, dist/worklet.js
```

Dev server plugin (`apps/daw/vite/plugins-catalog.ts`)

- On start, it reads `plugins/*/package.json` and builds the catalog: `{ plugins: [{ id, name, kind, url }] }`. Name and kind come from a `manifest.json` that the plugin build writes next to `index.js`.
- It serves `/plugins/<id>/*` from `plugins/<name>/dist/*`.
- `pnpm dev` runs each plugin's build in watch mode alongside the DAW, so editing a plugin rebuilds it. Reloading the page picks up the change.
- The worklet URL is resolved by the plugin itself: `new URL('./worklet.js', import.meta.url)`.

## Walkthrough: from pressing Play to hearing a note

The first beat sounds about 50 ms after the click, and every later note is placed sample-accurately ahead of time. The demo project has three nodes, `n1` note-gen, `n2` base-sine-synth and `master`, and two cables: `c1: n1.out → n2.in` (notes) and `c2: n2.out → master.in` (audio).

1. **Boot.** The store loads `demo.json`. The engine creates the AudioContext (suspended), fetches the catalog and loads n1 and n2. The router plans `c1` and `c2`, and applies them.
2. **Click Play.** The transport bar calls `play()`. The scheduler awaits `engine.unlock()`, sets `t0 = now + 0.05`, and emits `transport {playing: true, beat: 0, bpm: 120}` at t0.
3. **Fan-out.** The router passes that event to `n1.schedule()` and `n2.schedule()`.
4. **Generator.** n1 anchors on it and starts its ticker. On the first tick it emits note on C3 at t0 and note off at t0 + 0.25 s (half a beat at 120 BPM).
5. **Forwarding.** The router looks up `n1:out → [n2:in]` and calls `n2.schedule([noteOn, noteOff])` with the times unchanged.
6. **Synth.** n2 converts the times to frames and posts them to its worklet. At frame `t0 × sampleRate` a voice starts at 261.6 Hz.
7. **Output.** The sound passes through n2's strip (volume, pan), its cable gain, Master gain and the analyser, then reaches the speakers.
8. **Every 25 ms** n1 books the beats that fall in the next 100 ms, at exact audio times. Booking ahead absorbs late timers (see Scheduler).
9. **Click Pause or Stop.** The scheduler emits `transport {playing: false}` and CC 123 at now. n1 stops and closes its open note. n2 drops queued notes and releases every voice over 30 ms. Pause keeps the beat; Stop rewinds to 0.

## Errors and edge cases

No error stops the rest of the graph: a broken node goes red and is skipped, and everything else keeps playing.

| Case | Behaviour |
| --- | --- |
| Plugin module fails to load or `create` rejects | Status `error` + message in the node panel; the node and its cables stay in the project and are skipped by the router |
| Plugin id not in the catalog | Same as above, message "plugin not found" |
| `apiVersion` is not 2 | Same, message "unsupported plugin API" (the v1 adapter arrives in v1.1) |
| Plugin throws in `schedule`, a listener or `getState` | Caught; logged with node id; one toast per node; routing continues |
| Node removed while playing | CC 123 to it and to its event targets, cable gains fade out, then `dispose()` |
| Events cable removed while playing | CC 123 to the old target |
| Cable added while playing | Audio fades in over 10 ms; events start with the next emitted event |
| BPM changed while playing | Beat continues smoothly; notes already queued in the next 100 ms keep the old spacing (at most one slightly early or late note) |
| Play pressed before the AudioContext is unlocked | `play()` awaits `unlock()`, so the click itself is the unlocking gesture |
| Tab hidden while playing | Ticks continue from Worker timers; sound continues |
| Unknown parameter id in `automation` | The plugin ignores it (API rule) |
| Event time already in the past | Happens when the page freezes for more than the 100 ms lookahead: garbage collection, a heavy redraw, a laptop waking from sleep. The event applies at once (API rule: time ≤ now means as soon as possible). The note generator never books a beat that is already past, so after a freeze it skips the missed beats instead of playing them all together. |

## Testing

Agents cannot hear, so every part ends in an automated test plus one listening step for Ivan. `pnpm check` runs typecheck, lint, Vitest and Playwright.

| Layer | Tool | What is tested |
| --- | --- | --- |
| ivandaw-core timing | Vitest | `beatAt` / `timeAt` round-trip; `beatsIn` at 60, 120, 200 BPM; tempo change keeps beat continuous |
| Scheduler | Vitest + fake clock + fake ticker | Event times for Play, Pause, resume, BPM change, Stop + CC 123; no duplicate events |
| Router | Vitest (pure) | All 5 refusal reasons; a cable on a taken input replaces the old one (Master excepted); plan diff gives the right connect / disconnect lists |
| Store | Vitest | Every action; removeNode drops its cables; ids never reused |
| Note generator | Vitest + fake clock | Exactly one note on + off per beat over 16 bars, across a BPM change and a pause / resume |
| Sine DSP | Vitest on `dsp.ts` | Frequency of C3 ≈ 261.6 Hz; attack and release lengths; 9th note steals the oldest voice; no sample above 1.0 |
| Whole app | Playwright (Chromium, autoplay allowed) | Load page → Play → `__ivandaw.rms() > 0.01` within 1 s → Stop → rms < 0.001 within 0.5 s |

Test hook, present in dev builds:

```typescript
window.__ivandaw = { play(), stop(), rms(): number, project(): Project, status(): Record<string, string> }
```

Listening checks for Ivan, one per part, written in each PR's "Test on localhost" section, for example:

- P4: `?click=1`, 120 BPM: an even click; change to 180 while playing, with no stumble.
- P11: Play: C3 on every beat; delete cable → silence without a click; redraw it → the beat returns on the next beat.

## Decisions

None. Decided on 2026-11-12:

- Pause is in v1. Stop rewinds to beat 0.
- No hidden link to Master: a new instrument gets a real cable. One cable per input, except Master.
- Volume 0–1.5, master gain 0.8. The note generator stays fixed at C3.
- On CC 123 a plugin also drops queued events at or after that time, so no note starts after Stop.
- `host.transport()` returns the beat at the moment of the call.
- The API rule "send transport once per bar while playing" is removed.
- Control (v1.2) arrives as `automation` events, smoothed in the plugin.

The four API changes are written into the Web Plugin API doc.
