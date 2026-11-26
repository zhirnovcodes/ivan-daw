# Task · MIDI plugins: host-driven `render(until)`

For the Claude Code sessions in `zhirnovcodes/banana-chords` and `zhirnovcodes/choko-arpegio`. Each lands as its own change and release (`daw-build-<n>`) in that repo.

Needs ivandaw-core `v0.3.0` (`github:zhirnovcodes/ivan-daw-core#v0.3.0`), which adds the optional `render?` method to `PluginInstance`.

## Why

A MIDI plugin fed by another lookahead MIDI plugin plays late. Heard in the ivan-daw preset `AllInstruments`: on some presses of Play, the bass (Banana Chords → Choko Arpegio → Brimstone Bass) lands after the drums and pad.

Today each plugin's `hosts/web/driver.ts` runs its own 25 ms ticker and renders up to `now + 100 ms` on each tick. The two tickers are not in phase:

1. Choko ticks first and renders up to its `now + 100 ms`. It has no chord yet, so it renders nothing.
2. Banana ticks a few ms later and emits the chord, timed inside the span Choko already rendered.
3. Choko's driver puts input older than its render edge at frame 0 of its next block, so the arp notes come out up to 25 ms late, more when the main thread stalls.

Fix: the host drives one clock. Every tick it calls `render(until)` on each MIDI plugin with the same `until`, sources first, so a plugin's input is always in place before it renders.

## The API (ivandaw-core `src/api.ts`)

```ts
export interface PluginInstance {
  // … unchanged …
  /** Host-driven rendering for MIDI plugins. Render and emit, through listen(), every event
   *  with time < until, before returning. The first call means the host drives this instance:
   *  stop the plugin's own ticker for good. Optional: without it the plugin keeps its own ticker. */
  render?(until: number): void
}
```

### What the host does

1. Calls `render(until)` every `TICK_MS` (25 ms) with `until = currentTime + LOOKAHEAD` (100 ms), whether or not the transport is playing.
2. Gives every instance the same `until` in one pass, in topological order of the events cables: a plugin is called after every plugin that feeds it.
3. Passes events a plugin emits during `render()` straight to downstream `schedule()`, before the downstream `render()` is called.
4. Runs an extra pass right after Play, Pause and Stop, so the first notes are booked without waiting for a tick.
5. Never moves `until` backwards for an instance. It may repeat a value; then there is nothing to do.

### What the plugin does

1. `render(until)` renders from its last edge to `until` and emits before returning. No promises, microtasks or timers.
2. After the first `render()` call its own ticker stays off, including after `resume()`.
3. `suspend()` still silences it and stops rendering until `resume()`. The host keeps calling `render()`; while suspended it does nothing.
4. Input that arrives late (time before the edge) still goes to frame 0 of the next block, as today. With the host driving, this only happens for live UI and automation input.

## What to change

Only the web host layer: `hosts/web/driver.ts` and one line in `hosts/web/plugin.ts`. Don't touch the core, the WASM or any timing maths.

The ticker callback already renders up to a horizon. Make the horizon an argument and let the host call it:

```ts
// hosts/web/driver.ts (names as in the current driver; keep your prefix, bc_ / ca_)
let hostDriven = false;
let suspended = false;

/** Renders [r, until) and emits. This is the old ticker callback with `until` passed in. */
function renderTo(until: number) {
  const now = deps.now();
  if (r < now) r = now;
  if ((!playing && ((r = now), !pending.some((e) => e.time < until))) || until <= r) return;
  const frames = Math.round((until - r) * deps.sampleRate);
  if (frames <= 0) return;
  // … apply pending events at their frame, core process(frames), emit outputs … (unchanged)
}

const tick = () => renderTo(deps.now() + deps.lookahead);

const startTicker = () => {
  if (hostDriven || suspended) return;
  ticker ??= deps.createTicker(deps.tickMs, tick);
  tick();
};

return {
  // … schedule, beatAt, allOff, dispose unchanged …
  render(until: number) {
    if (!hostDriven) {
      hostDriven = true;
      ticker?.stop();
      ticker = null;
    }
    if (!suspended) renderTo(until);
  },
  suspend() {
    suspended = true;
    ticker?.stop();
    ticker = null;
    allOff(deps.now());
  },
  resume() {
    suspended = false;
    startTicker(); // does nothing when host-driven
  },
};
```

```ts
// hosts/web/plugin.ts: expose it on the PluginInstance
render: (until: number) => driver.render(until),
```

Keep the ticker path working unchanged. Older ivan-daw builds and the plugin's own dev page never call `render()`.

## Tests (Vitest, fake clock and fake ticker)

1. **No ticker after render.** Create the driver, call `render(t)` once, advance the fake ticker: the driver renders nothing more on its own.
2. **Emits before returning.** Schedule a transport event (playing, beat 0) at `t0`, call `render(t0 + 0.1)`: the beat-0 notes are emitted during the call, timed at `t0` exactly (within 1 sample).
3. **Chain lands on time** (Choko only). Note-ons scheduled at `t0` followed by `render(t0 + 0.1)`: the first arp note is at `t0`, not later.
4. **Repeat `until` is a no-op.** Two calls with the same `until` emit nothing the second time.
5. **Suspend.** After `suspend()`, `render()` emits nothing; after `resume()` it renders again and no ticker starts.
6. **Ticker path unchanged.** Without any `render()` call, existing driver tests still pass.

## Release

1. Bump the ivandaw-core dependency to `#v0.3.0`.
2. Ship as the next `daw-build-<n>` release, as usual.
3. Tell Ivan the release number. ivan-daw moves the pin in its own commit (`banana-chords: pin daw-build-<n> (host-driven render)`), after a localhost check.

The host side lands in ivan-daw first and calls `render()` only on instances that have it, so the two plugins can ship in either order.

## What Ivan should hear

In ivan-daw, open `http://localhost:5173/?mode=dev&preset=AllInstruments`, add `&click=1`, and press Play then Stop about ten times. With both plugins updated, the first bass note lands with the click and the drums every time. Before the update it sometimes comes in a little after them.
