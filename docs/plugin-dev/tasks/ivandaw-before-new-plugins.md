# Task · ivan-daw: ready for external plugins

For a Claude Code session in `zhirnovcodes/ivan-daw`. Do this before the first new plugin repo (from `docs/plugin-dev/`) is pinned. Same workflow as the v1.1 plan: commit straight to `main`, one commit per task with its id, `pnpm check` green before each push.

Read from ivan-daw `main` on 2026-11-18.

## Where things stand

| Area | State | Ready? |
| --- | --- | --- |
| Catalog (`apps/daw/vite/plugins-catalog.ts`, C6) | Scans any `plugins/*/package.json` with `ivandaw.id`; a package without a `build` script counts as prebuilt | Yes |
| Plugin UI in the node box | Any manifest with `ui` | Yes |
| Router cable rules (`apps/daw/src/router/validate.ts`) | Generic by port kind; events → events allowed when `accepts` overlap; cycles refused | Yes, but see E1 |
| Several modulation outputs | `control-sliders` has two (`a`, `b`) | Yes |
| Fetching prebuilt plugins | `scripts/fetch-beatality.mjs` / `beatality-release.mjs`: `REPO` and `ASSET` are Beatality constants | **No** → F1–F3 |
| A MIDI plugin with an events **input** (arp, chord, any MIDI → MIDI) | No first-party MIDI plugin has one (`note-gen`, `note-hold` are out-only); no test covers a chain | **Unverified** → E1 |
| A failing plugin | Untested with a fetched plugin that fails to download or rejects `create()` | **Unverified** → E2 |
| Testing a plugin PR before it merges | Only released builds can be fetched | **No** → F4 |
| `CLAUDE.md` | Names only Beatality as external | **No** → D1 |

## Tasks

| Id | Task | Check |
| --- | --- | --- |
| D0 | Commit `docs/plugin-dev/` | – |
| F1 | Generic release helpers | Vitest |
| F2 | Generic fetch script | Vitest + manual |
| F3 | Root scripts | `pnpm i` |
| F4 | Install a local zip (PR artifact) | manual |
| E1 | MIDI → MIDI chains | Vitest + Playwright |
| E2 | One broken plugin doesn't break the DAW | Playwright |
| E3 | Every catalog plugin loads | Playwright |
| D1 | `CLAUDE.md`: external plugins | – |

Order: D0 → F1 → F2 → F3 → F4, and E1–E3 in parallel. D1 last. Nothing here changes a contract (C1–C7), so no design change is needed.

### D0 · Commit the plugin-dev docs

`docs/plugin-dev/` (README, 01, 03–07, `types/`, `templates/`, `tasks/`). Message: `D0: plugin-dev docs`.

### F1 · Generic release helpers

- Rename `scripts/beatality-release.mjs` → `scripts/plugin-release.mjs`, and its test.
- Remove the `REPO` and `ASSET` constants. `assetUrl(repo, asset, tag)` takes them.
- New pure helper `readPin(pkgJson)`: returns `{ id, repo, asset, release }` when `ivandaw.repo`, `ivandaw.asset` and `ivandaw.release` are all strings, else `undefined` (a first-party plugin). Throws on a half-filled pin (some fields present, not all) with the folder name.
- Keep `buildNumber`, `latestBuild`, `needsFetch`, `safeEntryPath`, `MARKER` as they are.
- Tests: today's cases with repo/asset passed in; `readPin` for a full pin, a first-party package, a half pin.

### F2 · Generic fetch script

`scripts/fetch-beatality.mjs` → `scripts/fetch-plugins.mjs`:

- Loops over `plugins/*/package.json`, keeps those where `readPin` returns a pin.
- For each: today's logic unchanged (marker `.release`, skip when installed, unzip with `safeEntryPath`, require `manifest.json`, check `manifest.id === ivandaw.id`).
- Plain run: a failure for one plugin warns and keeps its installed build; the others still fetch; exit code 0 (same as today: `pnpm i` and `pnpm dev` never fail because GitHub is down).
- `--update`: every pinned plugin. `--update <name>`: one. A failed `--update` sets exit code 1.
- Log prefix `[plugins] <name>:`.
- `plugins/beatality/package.json` gains `"repo": "zhirnovcodes/Beatality", "asset": "beatality-daw.zip"`.

Check: delete `plugins/beatality/dist`, run `node scripts/fetch-plugins.mjs` → `daw-build-<pinned>` reinstalled; run again → nothing downloaded.

### F3 · Root scripts (own commit: root `package.json`)

```json
"postinstall": "node scripts/fetch-plugins.mjs",
"dev": "node scripts/fetch-plugins.mjs && pnpm --filter ivandaw dev",
"plugins:update": "node scripts/fetch-plugins.mjs --update"
```

Remove `beatality:update`. Update `README.md` and `docs/plugin-dev/06-ivandaw-integration.md` if a command name differs from what they say.

### F4 · Install a local zip (test a plugin PR before merge)

`node scripts/fetch-plugins.mjs --zip <name> <path-to-zip>`: unzips a downloaded PR artifact (`<name>-daw.zip`) into `plugins/<name>/dist/` and writes `.release` = `local`. The next plain run sees `local` ≠ pin and restores the pinned release, so a local test never sticks by accident.

Add to `06-ivandaw-integration.md` under "Updating a plugin":

```
# test a plugin PR: download its <name>-daw artifact from the Actions run, then
node scripts/fetch-plugins.mjs --zip <name> ~/Downloads/<name>-daw.zip
pnpm dev
```

Check: install a Beatality PR artifact this way, hear it, run `pnpm i` → pinned build is back.

### E1 · MIDI → MIDI chains

Generators that take notes (arp, chord) sit between a note source and an instrument: Note hold → **arp** → synth. Nothing tests that path yet.

- Router Vitest (`router.test.ts`, `validate.test.ts`), with fake manifests: a `midi` plugin with `in` (events, accepts `midi`, `transport`) and `out` (events, `midi`).
  - Note hold `out` → arp `in` is allowed; arp `out` → synth `in` is allowed.
  - arp `out` → note hold has no input → refused (`kind`).
  - arp A → arp B → arp A refused (`cycle`).
  - Events emitted by A's `listen()` arrive at B's `schedule()` with the same `time`; transport events reach both.
  - Removing the cable A → B sends CC 123 to B (plugin-api rule).
- Playwright: a test-only plugin under `apps/daw/e2e/fixtures/` (not in `plugins/`, so it never shows in the real list) that forwards notes transposed by +12. Scene: Note hold → fixture → sine synth → Master. Play → `rms() > 0.01`; Stop → `rms() < 0.001`. If serving a fixture plugin needs a catalog change, stop and ask Ivan (C6).

Fix whatever the tests show in `router` / `engine` only.

### E2 · One broken plugin doesn't break the DAW

Playwright, with a fixture plugin whose `create()` rejects, and one whose `dist/` has a `manifest.json` but no `index.js`:

- The node shows its error state; the rest of the scene still plays (`rms() > 0.01`).
- Loading a project that names a plugin id not in the catalog: the node is kept (with an error), not deleted, so saving doesn't drop it.

Fix in `engine` / `store` if needed.

### E3 · Every catalog plugin loads

Playwright spec `catalog.spec.ts`: for every entry in `/plugins/catalog.json`, add the node to an empty scene and wait for `ready` (test hook C7). Instruments: send one note through the test hook and expect `rms() > 0.01`. Remove the node; expect no console errors.

This catches a broken new release as soon as its pin moves and `pnpm check` runs.

### D1 · CLAUDE.md: external plugins

- Repos table: one row "External plugins: one repo each, built from `docs/plugin-dev/`, fetched as pinned `daw-build-<n>` releases. Beatality is the first."
- Commands: `pnpm plugins:update [<name>]`, `node scripts/fetch-plugins.mjs --zip <name> <zip>`.
- Rules: "A plugin pin moves in its own commit `<name>: pin daw-build-<n> (<why>)`, after a localhost check. ivan-daw never edits a plugin's code; changes go to that plugin's repo by PR."
- Point to `docs/plugin-dev/README.md`.

## Done when

- [ ] `pnpm i` on a clean clone installs Beatality through `fetch-plugins.mjs`.
- [ ] Adding a new external plugin is: create `plugins/<name>/package.json` with `id`, `repo`, `asset`, `release` → `pnpm i` → it is in the plugin list.
- [ ] A MIDI → MIDI chain plays and stops cleanly (E1).
- [ ] A broken plugin shows an error and nothing else breaks (E2).
- [ ] `catalog.spec.ts` loads every plugin (E3).
- [ ] `pnpm check` green.

## Test on localhost (after F3)

```
## Test on localhost
1. git pull && pnpm i && pnpm dev
2. Open the demo scene. Press Play.
3. Expect: Beatality plays as before (it is now fetched by fetch-plugins.mjs). `pnpm plugins:update beatality` prints "already the newest" or pins a newer build.
4. Reply "ok" or describe what you heard
```
