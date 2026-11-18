# 05 · CI/CD

Two GitHub Actions workflows, copied from Beatality (`zhirnovcodes/Beatality/.github/workflows/`) with names swapped. Do not redesign them; keep every plugin repo identical so a fix in one copies to all.

| Workflow | Runner | Triggers | Produces |
| --- | --- | --- | --- |
| `daw-plugin.yml` | `ubuntu-24.04` | push to `master`, every PR, manual | PR: artifact `<name>-daw`. `master`: GitHub release `daw-build-<run number>` with `<name>-daw.zip` |
| `mac.yml` | `macos-15` | push to `master` touching native paths, manual | artifact `<Name>-mac.zip` (14 days): universal AU + VST3 + Standalone, ad-hoc signed, `auval` + `pluginval` checked, core tests run |

## Branch and release flow

| Step | What happens |
| --- | --- |
| 1 | Work on a branch, open a PR to `master` (plugin repos use PRs, like Beatality). |
| 2 | `daw-plugin.yml` builds the zip on the PR. Download the `<name>-daw` artifact to test before merging. |
| 3 | Merge. `daw-plugin.yml` publishes release `daw-build-<n>` (`make_latest: true`). `mac.yml` builds the desktop zip. |
| 4 | ivan-daw moves its pin to `daw-build-<n>` (see [06](06-ivandaw-integration.md)). |
| 5 | Desktop: download `<Name>-mac.zip` from the `mac.yml` run, run the DAW checklist in [07](07-checklists.md). |

The PR description ends with a **Ready for IvanDAW** section: release expected, what changed in ports / params / state, what to listen for. Beatality's Blocker B used this.

## Release contract (what ivan-daw relies on)

Never change these without changing ivan-daw's fetch config in the same step.

| Item | Value |
| --- | --- |
| Tag | `daw-build-<n>`, `<n>` = `github.run_number` of `daw-plugin.yml`. Increasing integer. ivan-daw sorts by number. |
| Asset | `<name>-daw.zip`, exactly one per release |
| Zip root | the contents of `apps/web/dist-daw/`: `index.js`, `manifest.json`, `<name>.wasm` at the top level (no wrapping folder) |
| Repo | public, so ivan-daw downloads without a token |

## .github/workflows/daw-plugin.yml

```yaml
name: DAW plugin

# Builds the IvanDAW web plugin (apps/web/dist-daw/) and, on master, publishes it as
# <name>-daw.zip in a daw-build-<run number> release. IvanDAW downloads a pinned release.
# The zip's root is the content of dist-daw/, so index.js sits at the top level.
on:
  workflow_dispatch:
  push:
    branches: [master]
  pull_request:

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - name: Set up emscripten
        uses: mymindstorm/setup-emsdk@v14
        with:
          # The version the local wasm build uses.
          version: 6.0.12
          actions-cache-folder: emsdk-cache

      - name: Install Ninja
        run: sudo apt-get update && sudo apt-get install -y ninja-build

      - name: Build wasm
        run: |
          emcmake cmake -S . -B build-wasm -G Ninja -DCMAKE_BUILD_TYPE=Release
          cmake --build build-wasm --target <name>

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Build DAW plugin
        run: pnpm --filter @<name>/web build:daw

      - name: Zip
        working-directory: apps/web/dist-daw
        run: |
          test -f index.js && test -f <name>.wasm && test -f manifest.json
          # instruments also: test -f processor.js
          zip -r "$GITHUB_WORKSPACE/<name>-daw.zip" .

      - uses: actions/upload-artifact@v4
        with:
          name: <name>-daw
          path: <name>-daw.zip

      - name: Publish release
        if: github.event_name != 'pull_request' && github.ref == 'refs/heads/master'
        uses: softprops/action-gh-release@v2
        with:
          tag_name: daw-build-${{ github.run_number }}
          name: DAW build ${{ github.run_number }}
          target_commitish: ${{ github.sha }}
          make_latest: true
          files: <name>-daw.zip
          body: |
            IvanDAW web plugin, built from ${{ github.sha }}.
            Unzip as the plugin folder: index.js is at the top level.
```

Differences from Beatality's file: target `<name>` instead of `beatality`, package `@<name>/web` instead of `@beatality/web-widget`, folder `apps/web` instead of `apps/web-widget`, `build:daw` also runs Vitest (see [03](03-web-host.md)). `processor.js` is checked only for instruments.

## .github/workflows/mac.yml

```yaml
name: macOS build

# Builds the universal (Apple Silicon + Intel) AU, VST3 and Standalone, checks them,
# and uploads an unsigned zip for testing. Signing and notarization come later.
on:
  workflow_dispatch:
  push:
    branches: [master]
    paths:
      - "core/**"
      - "hosts/**"
      - "apps/web/src/ui/**"
      - "params.json"
      - "tests/**"
      - "CMakeLists.txt"
      - ".github/workflows/mac.yml"

jobs:
  build:
    runs-on: macos-15
    timeout-minutes: 60
    env:
      ARTEFACTS: build/<Name>_artefacts/Release
      FX_ARTEFACTS: build/<Name>MidiFx_artefacts/Release   # MIDI plugins only
    steps:
      - uses: actions/checkout@v4

      # third_party/ is not in the repo; CMake downloads the pinned JUCE commit. Keep it between runs.
      - name: Cache JUCE download
        uses: actions/cache@v4
        with:
          path: build/_deps
          key: juce-${{ runner.os }}-${{ hashFiles('CMakeLists.txt') }}

      - name: Install Ninja
        run: brew list ninja >/dev/null 2>&1 || brew install ninja

      - name: Configure
        run: cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release

      - name: Build plugin
        # Instruments: <Name>_AU <Name>_VST3 <Name>_Standalone
        # MIDI plugins: <Name>_VST3 <Name>_Standalone <Name>MidiFx_AU
        run: cmake --build build --target <Name>_VST3 <Name>_Standalone <Name>MidiFx_AU

      - name: Check bundles
        run: |
          check() {
            bundle="$1"; binary="$bundle/Contents/MacOS/$2"
            echo "== $bundle: $(lipo -archs "$binary")"
            lipo -archs "$binary" | grep -q arm64
            lipo -archs "$binary" | grep -q x86_64
          }
          check "$ARTEFACTS/VST3/<Name>.vst3" "<Name>"
          check "$ARTEFACTS/Standalone/<Name>.app" "<Name>"
          check "$FX_ARTEFACTS/AU/<Name> MIDI FX.component" "<Name> MIDI FX"
          # instruments: check "$ARTEFACTS/AU/<Name>.component" "<Name>"

      # Ad-hoc signature over the whole bundle so it loads on Apple Silicon.
      - name: Ad-hoc sign
        run: |
          for b in "$ARTEFACTS/VST3/<Name>.vst3" "$ARTEFACTS/Standalone/<Name>.app" "$FX_ARTEFACTS/AU/<Name> MIDI FX.component"; do
            codesign --force --sign - --options runtime "$b"
            codesign --verify --strict --verbose=2 "$b"
          done

      - name: Validate AU (auval)
        run: |
          mkdir -p ~/Library/Audio/Plug-Ins/Components
          cp -R "$FX_ARTEFACTS/AU/<Name> MIDI FX.component" ~/Library/Audio/Plug-Ins/Components/
          killall -9 AudioComponentRegistrar 2>/dev/null || true
          auval -a | grep -i <MFR> || true
          # MIDI FX: type aumi. Instruments: auval -strict -v aumu <CODE> <MFR>
          auval -strict -v aumi <CODEFX> <MFR>

      - name: Validate with pluginval
        run: |
          curl -sL -o pluginval.zip https://github.com/Tracktion/pluginval/releases/latest/download/pluginval_macOS.zip
          unzip -q pluginval.zip
          PV=pluginval.app/Contents/MacOS/pluginval
          $PV --strictness-level 10 --skip-gui-tests --validate-in-process "$ARTEFACTS/VST3/<Name>.vst3"
          $PV --strictness-level 10 --skip-gui-tests --validate-in-process "$HOME/Library/Audio/Plug-Ins/Components/<Name> MIDI FX.component"

      - name: Package
        run: |
          mkdir -p dist/<Name>-mac
          cp -R "$ARTEFACTS/VST3/<Name>.vst3" "$ARTEFACTS/Standalone/<Name>.app" "$FX_ARTEFACTS/AU/<Name> MIDI FX.component" dist/<Name>-mac/
          cat > dist/<Name>-mac/README.txt <<'EOF'
          <Name> test build (unsigned). Not for distribution.

          Install:
            <Name> MIDI FX.component  ->  ~/Library/Audio/Plug-Ins/Components/
            <Name>.vst3               ->  ~/Library/Audio/Plug-Ins/VST3/
            <Name>.app                ->  /Applications/ (or anywhere)

          macOS blocks unsigned downloads. After copying, run in Terminal:
            xattr -dr com.apple.quarantine "$HOME/Library/Audio/Plug-Ins/Components/<Name> MIDI FX.component"
            xattr -dr com.apple.quarantine ~/Library/Audio/Plug-Ins/VST3/<Name>.vst3
            xattr -dr com.apple.quarantine /Applications/<Name>.app

          Logic: if <Name> does not show up, open Logic > Settings > Plug-in Manager and rescan.
          EOF
          cd dist && ditto -c -k --keepParent <Name>-mac <Name>-mac.zip

      - uses: actions/upload-artifact@v4
        with:
          name: <Name>-mac
          path: dist/<Name>-mac.zip
          retention-days: 14

      # Last, so a failing test still leaves a plugin zip to try. The run is still marked failed.
      - name: Build core tests
        run: cmake --build build --target <pfx>_tests

      - name: Run core tests
        run: |
          failed=0
          for t in <pfx>_tests; do
            echo "== $t"
            out=$(./build/$t 2>&1) || failed=1
            # One line per failing check, with how many times it failed.
            printf '%s\n' "$out" | grep '^FAIL' | sort | uniq -c
            printf '%s\n' "$out" | grep -v '^FAIL'
          done
          exit $failed
```

For an **instrument**, use Beatality's `mac.yml` as is: build `<Name>_AU <Name>_VST3 <Name>_Standalone`, loop the three bundles in "Check bundles" / "Ad-hoc sign" / "Package", run `auval -strict -v aumu <CODE> <MFR>`, and drop `FX_ARTEFACTS`.

Differences from Beatality's file: names; `paths` adds `params.json` and uses `apps/web/src/ui/**`; MIDI plugins swap the AU instrument for the AU MIDI FX target and validate it as `aumi`; Beatality's Factory-folder check is only for plugins that ship factory files.

## Pinned versions

Keep these in step with Beatality. When Beatality bumps one, bump it in every plugin repo.

| Tool | Version | Where |
| --- | --- | --- |
| emscripten | 6.0.12 | `daw-plugin.yml` |
| Node | 24 | `daw-plugin.yml` |
| pnpm | `packageManager` in root `package.json` | `pnpm/action-setup@v4` reads it |
| JUCE | `ea77444750de45e036e0279bb0291144bf8e3688` (8.0.16-security) | `CMakeLists.txt` |
| macOS runner | `macos-15` | `mac.yml` |
| pluginval | latest release | `mac.yml` |

## Not in Beatality's CI yet

Beatality's CI has no Windows job, so FL Studio and Ableton on Windows get no VST3 from CI today. The same is true for every plugin that copies it. When Windows builds are needed, add this third workflow to every repo at once (Beatality first):

```yaml
name: Windows build
on:
  workflow_dispatch:
  push:
    branches: [master]
    paths: ["core/**", "hosts/**", "apps/web/src/ui/**", "params.json", "tests/**", "CMakeLists.txt", ".github/workflows/windows.yml"]
jobs:
  build:
    runs-on: windows-2025
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with: { path: build/_deps, key: juce-${{ runner.os }}-${{ hashFiles('CMakeLists.txt') }} }
      - uses: ilammy/msvc-dev-cmd@v1
      - run: cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
      - run: cmake --build build --target <Name>_VST3 <Name>_Standalone
      - name: Validate with pluginval
        shell: bash
        run: |
          curl -sL -o pluginval.zip https://github.com/Tracktion/pluginval/releases/latest/download/pluginval_Windows.zip
          unzip -q pluginval.zip
          ./pluginval.exe --strictness-level 10 --skip-gui-tests --validate-in-process "build/<Name>_artefacts/Release/VST3/<Name>.vst3"
      - shell: bash
        run: cd build/<Name>_artefacts/Release && 7z a "$GITHUB_WORKSPACE/<Name>-win.zip" VST3 Standalone
      - uses: actions/upload-artifact@v4
        with: { name: <Name>-win, path: <Name>-win.zip, retention-days: 14 }
```

Code signing and notarization (macOS) and an installer are later steps for both platforms, as in Beatality.
