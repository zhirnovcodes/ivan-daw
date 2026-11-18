# Plugin development guide

How to build IvanDAW plugins that also ship as VST3 / AU / Standalone for Ableton, Logic, FL Studio and other DAWs. Every plugin follows the Beatality pattern: one C++ core, two hosts, two CI workflows.

Written for LLM agents and humans. Each file stands alone; load only the ones your task needs.

## Which file to read

| Task | Read |
| --- | --- |
| Start a new plugin repo | this file, [01-architecture.md](01-architecture.md), the type file, [07-checklists.md](07-checklists.md) |
| MIDI note generator (arp, sequencer, chord, euclid, note hold) | [types/midi-generator.md](types/midi-generator.md) |
| MIDI control (LFO, sliders, envelope follower, macro) | [types/midi-control.md](types/midi-control.md) |
| Audio instrument (synth, sampler, drum machine, Beatality) | [types/audio-instrument.md](types/audio-instrument.md) |
| The IvanDAW build (wasm, AudioWorklet, `PluginFactory`) | [03-web-host.md](03-web-host.md) |
| The VST3 / AU / Standalone build (JUCE) | [04-vst-host.md](04-vst-host.md) |
| GitHub Actions: build, test, release | [05-ci-cd.md](05-ci-cd.md) |
| Load a released plugin into IvanDAW | [06-ivandaw-integration.md](06-ivandaw-integration.md) |
| A `CLAUDE.md` for the new plugin repo | [templates/CLAUDE.md](templates/CLAUDE.md) |
| Prepare ivan-daw before the first new plugin (task) | [tasks/ivandaw-before-new-plugins.md](tasks/ivandaw-before-new-plugins.md) |
| Move Beatality to one `params.json` (task, Beatality repo) | [tasks/beatality-params-json.md](tasks/beatality-params-json.md) |

Reading order: README → 01 → `types/` (step 02, one file per plugin type) → 03 → 04 → 05 → 06 → 07.

## The pattern in one picture

```
                 params.json  (one parameter list, both hosts read it)
                      │
          core/   C++20, no exceptions, no RTTI, no I/O, unit-tested
          ┌───────────┴────────────┐
 hosts/web/                    hosts/plugin/
 C ABI → <name>.wasm           JUCE AudioProcessor + WebView editor
 + processor.ts / index.ts     → AU, VST3, Standalone
          │                            │
 CI: daw-plugin.yml            CI: mac.yml
 → release daw-build-<n>       → artifact <Name>-mac.zip
   asset <name>-daw.zip          (universal, ad-hoc signed, auval + pluginval)
          │
 ivan-daw pins daw-build-<n>, fetches the zip into plugins/<name>/dist/
```

## Requirements this guide meets

| Requirement | How |
| --- | --- |
| Easy to build into the DAW | The CI release zip is a ready plugin folder (`index.js` + `manifest.json` at the root). ivan-daw adds one `package.json` with a pinned release; nothing is built in ivan-daw. See [06](06-ivandaw-integration.md). |
| VST variant for Ableton, Logic, FL Studio, etc. | JUCE builds VST3 (Ableton, FL Studio, Bitwig, Cubase, Reaper, Studio One) and AU (Logic, GarageBand). MIDI plugins get a second AU MIDI FX target for Logic. See [04](04-vst-host.md). |
| Same CI/CD as Beatality | Two workflows copied from Beatality with names swapped: `daw-plugin.yml` and `mac.yml`. See [05](05-ci-cd.md). |
| Easy for an LLM to read | Markdown, tables, exact paths, copy-paste code, rules as short imperatives. |

## Placeholders

Every doc uses these. Replace them all when you copy a template.

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `<name>` | repo name, kebab-case; also the wasm and zip name | `arp-gen` |
| `<Name>` | JUCE target and product name, PascalCase | `ArpGen` |
| `<pfx>` | C ABI and C++ namespace prefix, 2–3 lowercase letters | `ag` |
| `<id>` | IvanDAW plugin id, reverse-DNS, never changes | `com.ivandaw.arp-gen` |
| `<MFR>` | 4-char AU/VST manufacturer code, at least 1 uppercase; one for all your plugins | `Ivdw` |
| `<CODE>` | 4-char plugin code, exactly 1 uppercase, unique per plugin target | `Ag01` |
| `<CODEFX>` | plugin code of the AU MIDI FX target (MIDI plugins only) | `Agx1` |

## Glossary

| Term | Meaning |
| --- | --- |
| core | Pure C++ in `core/`. Knows nothing of JUCE, wasm, or the browser. |
| host adapter | Code that runs the core inside one environment: `hosts/web` (IvanDAW) or `hosts/plugin` (JUCE). |
| Plugin API v2 | IvanDAW's plugin contract. Types: `ivandaw-core` `src/api.ts`. Rules: `docs/plugin-api.md`. |
| `daw-build-<n>` | GitHub release tag CI makes on every push to `master`; `<n>` is the workflow run number. |
| `<name>-daw.zip` | The release asset: the IvanDAW plugin folder. |
| frame | One audio sample position. Both hosts drive the core in frames. |
| normalized | A parameter value in 0..1 (what DAWs and IvanDAW `automation` send). |
| plain | A parameter value in `min..max` (what the core receives). |

## Plugin types at a glance

| Type | IvanDAW `kind` | IvanDAW ports | DAW build | DAW output |
| --- | --- | --- | --- | --- |
| MIDI note generator | `midi` | events in, events out (`midi`) | VST3 instrument with MIDI out + AU MIDI FX | MIDI notes |
| MIDI control | `modulator` | events in, one `modulation` out per control | VST3 instrument with MIDI out + AU MIDI FX | MIDI CC |
| Audio instrument | `instrument` | events in, stereo audio out | VST3 + AU instrument + Standalone | audio |
