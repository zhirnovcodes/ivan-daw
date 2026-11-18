# Task · Beatality: one parameter list (`params.json`)

For the Claude Code session in `zhirnovcodes/Beatality`. Lands as one PR to `master`, like every Beatality change.

Background: ivan-daw `docs/plugin-dev/01-architecture.md` → "params.json: one parameter list".
Read from Beatality `master` on 2026-11-18: `hosts/plugin/PluginProcessor.cpp` (`parameterLayout()`), `presenters/web/BeatalityParameters.ts`, `apps/web-widget/src/dawParameters.ts`, `core/domain/*Settings.h`, `core/domain/Effects.h`, `core/domain/SliceGrid.h`.

## Goal

Beatality's parameters are defined once, in `params.json` at the repo root. The JUCE build and the web build both read it. Nothing a user or a DAW project sees changes, except the fixes in "Mismatches found".

## Today: two lists, kept in sync by hand

| List | File | Count |
| --- | --- | --- |
| JUCE (VST3 / AU / Standalone) | `hosts/plugin/PluginProcessor.cpp`, `parameterLayout()` | 50 |
| Web (rack page v1, IvanDAW v2) | `presenters/web/BeatalityParameters.ts` entries, with groups / units / triggers added in `apps/web-widget/src/dawParameters.ts` | 49 |

## Mismatches found (fix in this PR)

| # | Parameter | JUCE | Web | Do |
| --- | --- | --- | --- | --- |
| M1 | `chaos` (the CHAOS button) | Bool, exists | missing | Add it to the web list; write = the same action as the CHAOS button (`fireChaos`), fires on a rise past 0.5 like `randomize`. |
| M2 | `chaosSliceSize` range | -1..1 (`bt::ChaosSettings::kSliceSizeMax = 1`) | -1..2 | **Ask Ivan.** The `ChaosSettings.h` comment says "1/2..4" (= -1..2) and `PluginProcessor.h` says "-1..2", but the constant is 1. Fix the constant or the comments so all three agree, then use that in `params.json`. |
| M3 | Chaos group labels | "Chaos effects (global)", "Chaos beat repeat on/off", … | "Chaos effects global", … (built from `chaosGroupNames`) | Use the JUCE labels. Labels are display only, so changing them is safe. |
| M4 | Order | `chaos` 4th, `retrig` last | `retrig` 7th, no `chaos` | `params.json` uses the **JUCE order**. The web order doesn't matter to anything stored. |
| M5 | `chaosTrigger` kind | Choice (Note, Loop, Slices, Beats, None) | int 0..4, made a choice in `dawParameters.ts` | `choice` with `choices` in `params.json`. The v1 rack page reads it as int 0..4, which is the same thing. |

## params.json (complete)

Order = today's JUCE `parameterLayout()` order. Defaults = what the JUCE code uses today (core struct defaults). The `<M2>` marker is for decision M2 above.

```json
{
  "version": 1,
  "params": [
    { "id": "loop", "label": "Loop", "kind": "int", "min": 1, "max": 32, "default": 8, "unit": "beats", "group": "Loop", "automatable": true },
    { "id": "slice", "label": "Slices", "kind": "int", "min": -4, "max": 4, "default": 0, "group": "Loop", "automatable": true },
    { "id": "randomize", "label": "Randomize", "kind": "trigger", "min": 0, "max": 1, "default": 0, "group": "Loop", "automatable": true },
    { "id": "chaos", "label": "Chaos", "kind": "trigger", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "volume", "label": "Volume", "kind": "float", "min": 0, "max": 1.2, "default": 1, "group": "Output", "automatable": true },
    { "id": "panMin", "label": "Pan minimum", "kind": "float", "min": -1, "max": 1, "default": 0, "group": "Output", "automatable": true },
    { "id": "panMax", "label": "Pan maximum", "kind": "float", "min": -1, "max": 1, "default": 0, "group": "Output", "automatable": true },
    { "id": "effectsOn", "label": "Effects on", "kind": "boolean", "min": 0, "max": 1, "default": 1, "group": "Effects", "automatable": true },
    { "id": "shuffle", "label": "Shuffle", "kind": "trigger", "min": 0, "max": 1, "default": 0, "group": "Effects", "automatable": true },
    { "id": "globalPower", "label": "Global power", "kind": "float", "min": 0, "max": 1, "default": 1, "group": "Effects", "automatable": true },
    { "id": "globalChance", "label": "Global chance", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Effects", "automatable": true },
    { "id": "fxTimeMin", "label": "Effect time minimum", "kind": "int", "min": -4, "max": 1, "default": -3, "group": "Effects", "automatable": true },
    { "id": "fxTimeMax", "label": "Effect time maximum", "kind": "int", "min": -4, "max": 1, "default": -1, "group": "Effects", "automatable": true },
    { "id": "delayPower", "label": "Delay power", "kind": "float", "min": 0, "max": 1, "default": 1, "group": "Effects", "automatable": true },
    { "id": "delayChance", "label": "Delay chance", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Effects", "automatable": true },
    { "id": "reverbPower", "label": "Reverb power", "kind": "float", "min": 0, "max": 1, "default": 1, "group": "Effects", "automatable": true },
    { "id": "reverbChance", "label": "Reverb chance", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Effects", "automatable": true },
    { "id": "reversePower", "label": "Reverse power", "kind": "float", "min": 0, "max": 1, "default": 1, "group": "Effects", "automatable": true },
    { "id": "reverseChance", "label": "Reverse chance", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Effects", "automatable": true },
    { "id": "filterPower", "label": "Filter power", "kind": "float", "min": 0, "max": 1, "default": 1, "group": "Effects", "automatable": true },
    { "id": "filterChance", "label": "Filter chance", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Effects", "automatable": true },
    { "id": "flangerPower", "label": "Flanger power", "kind": "float", "min": 0, "max": 1, "default": 1, "group": "Effects", "automatable": true },
    { "id": "flangerChance", "label": "Flanger chance", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Effects", "automatable": true },
    { "id": "trancePower", "label": "Trance power", "kind": "float", "min": 0, "max": 1, "default": 1, "group": "Effects", "automatable": true },
    { "id": "tranceChance", "label": "Trance chance", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Effects", "automatable": true },
    { "id": "shiftPower", "label": "Shift power", "kind": "float", "min": 0, "max": 1, "default": 1, "group": "Effects", "automatable": true },
    { "id": "shiftChance", "label": "Shift chance", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Effects", "automatable": true },
    { "id": "repeatOn", "label": "Beat repeat on", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Repeat", "automatable": true },
    { "id": "repeatSizeMin", "label": "Size minimum", "kind": "int", "min": -5, "max": 1, "default": 0, "group": "Repeat", "automatable": true },
    { "id": "repeatSizeMax", "label": "Size maximum", "kind": "int", "min": -5, "max": 1, "default": 0, "group": "Repeat", "automatable": true },
    { "id": "repeatMix", "label": "Mix", "kind": "float", "min": 0, "max": 1, "default": 1, "group": "Repeat", "automatable": true },
    { "id": "repeatLength", "label": "Length", "kind": "int", "min": -4, "max": 1, "default": 0, "group": "Repeat", "automatable": true },
    { "id": "repeatChance", "label": "Chance", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Repeat", "automatable": true },
    { "id": "chaosTrigger", "label": "Chaos trigger", "kind": "choice", "min": 0, "max": 4, "default": 4, "choices": ["Note", "Loop", "Slices", "Beats", "None"], "group": "Chaos", "automatable": true },
    { "id": "chaosValue", "label": "Chaos value", "kind": "float", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosBeatSize", "label": "Chaos beat size", "kind": "int", "min": -2, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosLoopSize", "label": "Chaos loop size", "kind": "int", "min": 1, "max": 8, "default": 1, "group": "Chaos", "automatable": true },
    { "id": "chaosSliceSize", "label": "Chaos slice size", "kind": "int", "min": -1, "max": "<M2>", "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosPan", "label": "Chaos pan", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosSlices", "label": "Chaos slices", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosRandomize", "label": "Chaos randomize", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosEffectsGlobal", "label": "Chaos effects (global)", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosEffectsOn", "label": "Chaos effects on/off", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosEffectsPrivate", "label": "Chaos effects (private)", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosRepeatOn", "label": "Chaos beat repeat on/off", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosRepeatPositions", "label": "Chaos beat repeat positions", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosRepeatParams", "label": "Chaos beat repeat params", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosValueOn", "label": "Chaos chaos value", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "chaosTime", "label": "Chaos time", "kind": "boolean", "min": 0, "max": 1, "default": 0, "group": "Chaos", "automatable": true },
    { "id": "retrig", "label": "Retrig", "kind": "boolean", "min": 0, "max": 1, "default": 1, "group": "Loop", "automatable": true }
  ]
}
```

Check each default against the code before committing; the source is in the "Defaults" column of the steps below.

## Rules (breaking these breaks saved DAW projects)

| Rule | Why |
| --- | --- |
| Every `id` stays exactly as it is | DAWs store automation and parameter values by id |
| `juce::ParameterID { id, 1 }`: the version stays 1 | Part of the id the host stores |
| Same order as today's `parameterLayout()` | Hosts list parameters in this order; keeping it means no user-visible reshuffle and no risk with hosts that store by index |
| Same ranges; all floats stay linear (no skew) | Saved automation is stored as 0..1; a new range moves every saved value |
| JUCE parameter classes stay the same: `trigger` and `boolean` → `AudioParameterBool`, `int` → `AudioParameterInt`, `choice` → `AudioParameterChoice`, `float` → `AudioParameterFloat` | The class sets how the host steps and displays the value |
| Logic stays in code | min ≤ max for range pairs, trigger firing and reset, chaos group array, `read` / `write` per parameter |
| Pack text (`getStateInformation`) unchanged | Saved projects and `.beatality` packs must still load |

## Steps

1. **`params.json`** at the repo root, content above, with M2 decided. Defaults come from `bt::SliceGrid`, `bt::Effects`, `bt::BeatRepeatSettings`, `bt::ChaosSettings` and the literals in today's `parameterLayout()` (loop 8, volume 1, retrig true).
2. **Core check (C++).** New test executable `params_tests` (or add to `domain_tests`): parse `params.json` with a tiny reader, or generate a header at configure time with CMake `file(READ)` + `string(JSON ...)`. Assert every range and default equals the core constant or struct default: `kMinLoop`/`kMaxLoop`, `kExpMin`/`kExpMax`, `Effects::kBeatMin`/`kBeatMax`, `BeatRepeatSettings::kSizeMin`…, `ChaosSettings::k*`, `ChaosSettings::kGroups == 11`. Add it to `mac.yml`'s test list. This keeps `params.json` and the core from drifting apart.
3. **JUCE.**
   - `CMakeLists.txt`: add `params.json` to `juce_add_binary_data(BeatalitySkin ...)` sources.
   - `PluginProcessor.cpp`: `parameterLayout()` loops over `SkinData::params_json` (`juce::JSON::parse`) and adds one parameter per entry using the class table above. Delete the hand-written list and `kChaosGroupNames`; keep `kChaosGroupIds` only if other code still needs the ids in `bt::ChaosGroup` order (or look them up from `params.json` by the `chaos` prefix in order).
   - Constructor: after the member pointers are looked up by id, `jassert` each one is non-null, and in release fail loudly once (`errorText`). Today a typo would silently leave a null pointer.
4. **Web.**
   - `presenters/web/BeatalityParameters.ts`: each entry keeps its `read` / `write`, but `info` comes from `params.json` by id: `info: infoFor('loop')`. Add the `chaos` entry (M1). Build the chaos group entries from `params.json` ids, not `chaosGroupIds`.
   - `apps/web-widget/src/dawParameters.ts`: delete `triggers`, `groups`, `groupOf`, `units`. `isTrigger(id)` and `groupFor(id)` read `params.json`. `dawParameter()` copies `kind`, `group`, `unit`, `choices` from `params.json`. Keep `denormalize()` and `ChangeSources`. Keep `normalizedDefault`: IvanDAW defaults still come from the default pack.
   - Make sure Vite bundles the JSON into `index.js` (a plain `import params from '../../../params.json'` does).
5. **Web check (Vitest, add to `build:daw`).**
   - ids unique, `min < max`, `default` in range, `choices.length === max - min + 1` for `choice`.
   - Every `params.json` id has exactly one `BeatalityParameters` entry, and every entry's id is in `params.json`.
   - `dawParameter()` output for every id matches `params.json` (kind, group, unit, choices).
6. **Version.** Bump `VERSION` in `CMakeLists.txt` and `version` in `apps/web-widget/src/dawManifest.ts` together (0.0.1 → 0.0.2).
7. **PR** to `master` with the checks below and a "Ready for IvanDAW" section.

## Checks before merging

- [ ] `daw-plugin.yml` green on the PR; the `beatality-daw` artifact unzips with `index.js` at the top.
- [ ] `mac.yml` green: `auval -strict`, `pluginval --strictness-level 10`, all core tests including the new params test.
- [ ] Parameter list from the built VST3 is identical to the old build, apart from M2 and M3: compare `pluginval`'s parameter dump (or the Standalone's host parameter list) old vs new, same ids, same order, same ranges.
- [ ] Logic or Ableton: a project saved with the **old** build, with automation on `volume` and `globalChance`, opens with the new build and plays the same automation.
- [ ] Rack page (`rack.html`) and widget page still work; the v1 LFO in the rack still moves a parameter.
- [ ] IvanDAW (after the release, in the ivan-daw session): pin the new `daw-build-<n>`; control cable from LFO to Beatality `volume` works; the `ctl` picker lists parameters grouped Output / Loop / Effects / Repeat / Chaos, now including `Chaos`.

## Ready for IvanDAW (paste into the PR)

```
## Ready for IvanDAW
- Release: daw-build-<n> after merge
- Ports: none changed
- Params: same ids and ranges; new `chaos` trigger (fires the CHAOS button); chaosSliceSize range <M2 result>; chaos group labels renamed
- State: unchanged (pack text)
- Listen for: no change in sound. Control cable to Beatality `chaos` fires a chaos roll once per rise.
```
