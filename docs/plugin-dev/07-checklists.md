# 07 · Checklists

Copy the one you need into the PR description or the session, and tick as you go.

## A. New plugin repo

- [ ] Pick placeholders (README table): `<name>`, `<Name>`, `<pfx>`, `<id>`, `<CODE>` (and `<CODEFX>` for MIDI plugins). Check `<CODE>` is unused by your other plugins.
- [ ] Create public repo `zhirnovcodes/<name>`, default branch `master`.
- [ ] Layout from [01](01-architecture.md#repo-layout); `.gitignore` from Beatality.
- [ ] `CLAUDE.md` from [templates/CLAUDE.md](templates/CLAUDE.md), placeholders filled.
- [ ] `params.json` with at least one parameter; Vitest check for unique ids and defaults in range.
- [ ] `core/engine/Engine.h` with the shape in [01](01-architecture.md#the-engine-one-shape-for-all-three-plugin-types); one core test executable.
- [ ] `hosts/web/boundary/api.cpp` + `if(EMSCRIPTEN)` CMake branch; `emcmake … && cmake --build build-wasm --target <name>` works locally.
- [ ] `apps/web` package; `pnpm --filter @<name>/web build:daw` writes `dist-daw/` with `index.js`, `manifest.json`, `<name>.wasm`.
- [ ] Dev page plays / logs events.
- [ ] JUCE targets for the type ([04](04-vst-host.md#targets-per-plugin-type)); local build loads in one DAW.
- [ ] `.github/workflows/daw-plugin.yml` and `mac.yml` from [05](05-ci-cd.md), placeholders filled.
- [ ] First PR: `daw-plugin.yml` green, artifact downloads and unzips with `index.js` at the top.
- [ ] Merge → release `daw-build-1` exists with `<name>-daw.zip`; `mac.yml` green.
- [ ] ivan-daw: `plugins/<name>/package.json` pinned to `daw-build-1` ([06](06-ivandaw-integration.md)).

## B. Every PR in a plugin repo

- [ ] Core tests pass locally (`cmake --build build --target <pfx>_tests && ./build/<pfx>_tests`).
- [ ] `pnpm --filter @<name>/web build:daw` passes (typecheck, Vitest, build).
- [ ] `params.json`: only appended; no id renamed or removed.
- [ ] Manifest `version` and CMake `VERSION` bumped together if behaviour changed.
- [ ] State: new fields have defaults; old saved state still loads (test with a saved JSON fixture).
- [ ] No allocation, lock or log on the audio path.
- [ ] PR description ends with **Ready for IvanDAW**:
  ```
  ## Ready for IvanDAW
  - Release: daw-build-<n> after merge
  - Ports / params / state changes: <none | list>
  - Listen for: <what changes in sound>
  ```

## C. IvanDAW listening check (after moving a pin)

```
## Test on localhost
1. git pull && pnpm i && pnpm dev
2. Add <Name>; wire <source> → <Name> → <target> → Master. Press Play.
3. Expect: <what Ivan should hear>; Stop leaves no hanging note or sound; volume / pan / parameter moves make no clicks.
4. Reply "ok" or describe what you heard
```

Plus:

- [ ] Plugin UI shows inside the node box (if `ui` set); dragging the header moves it; its controls work.
- [ ] Save project, reload page → same sound (state round-trip).
- [ ] Remove the node while playing → silence, no console errors.
- [ ] `pnpm check` green before pushing the pin.

## D. DAW test matrix (from the `<Name>-mac.zip` artifact)

Install per the zip's `README.txt`. Record the result table in the plugin repo README with the build number.

| # | DAW | Steps | Expect |
| --- | --- | --- | --- |
| 1 | Logic Pro | Instruments: new Software Instrument track → `<Name>`. MIDI plugins: any instrument track → MIDI FX slot → `<Name> MIDI FX` | Instrument sounds from the keyboard; MIDI FX changes what the track's instrument plays |
| 2 | Ableton Live | Instruments: drag `<Name>` VST3 to a MIDI track. MIDI plugins: `<Name>` on track A; track B *MIDI From* = A / `<Name>`, monitor *In*, a synth on B | Sound / notes / CC reach the synth |
| 3 | FL Studio | Add `<Name>` to the channel rack. MIDI plugins: wrapper settings → MIDI output port N; target plugin input port N | Same as above |
| 4 | Any | Play, stop, loop a 2-bar region, change tempo while playing | Stays in time, no hanging notes, no clicks |
| 5 | Any | Automate one parameter from the DAW; save, close, reopen the project | Automation plays; state restores exactly |
| 6 | Any | Open and close the editor while playing | Sound unchanged |
| 7 | Standalone | Open `<Name>.app`, pick audio / MIDI device | Works without a DAW |

Windows rows (Ableton, FL Studio) need a Windows build: not in CI yet, see [05](05-ci-cd.md#not-in-beatalitys-ci-yet). Until then, build locally with Visual Studio 2022 + Ninja and test by hand.

## E. Breaking changes (avoid; if unavoidable)

| Change | Also do |
| --- | --- |
| Port added / removed / renamed | New `manifest.version` major; ivan-daw projects using it need a migration; note in Ready for IvanDAW |
| Parameter removed | Don't. Hide it (`automatable: false`, `hidden: true`), keep its index |
| `PLUGIN_CODE` / `<MFR>` changed | Don't. DAW projects lose the plugin |
| State format | Bump `data.v`; `setState` reads every older `v` |
| Release contract (tag, asset name, zip root) | Change ivan-daw's `plugins/<name>/package.json` and fetch script in the same step |
