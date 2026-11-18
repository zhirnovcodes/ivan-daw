# 06 · Bringing a plugin into IvanDAW

ivan-daw never builds an external plugin. It pins one `daw-build-<n>` release and downloads the zip into `plugins/<name>/dist/`. The catalog then finds it like any first-party plugin. This is how Beatality works today.

## How loading works (no changes needed)

- `apps/daw/vite/plugins-catalog.ts` scans `plugins/*/package.json` for `"ivandaw": { "id" }`.
- It reads `plugins/<name>/dist/manifest.json`, checks `manifest.id` equals `ivandaw.id`, and serves `/plugins/catalog.json`.
- It serves `/plugins/<id>/*` from `plugins/<name>/dist/*`. The DAW `import()`s `/plugins/<id>/index.js` at runtime.
- A package without a `build` script is treated as prebuilt (no watch build).

So a plugin is "in the DAW" as soon as `plugins/<name>/package.json` exists and `dist/` holds the unzipped release.

## Today: Beatality only

| File | Role |
| --- | --- |
| `plugins/beatality/package.json` | `"ivandaw": { "id": "com.beatality.beatality", "release": "daw-build-4" }` |
| `scripts/beatality-release.mjs` | pure helpers: `REPO`, `ASSET`, `latestBuild`, `assetUrl`, `needsFetch`, `safeEntryPath` (Vitest-tested) |
| `scripts/fetch-beatality.mjs` | download + unzip on `pnpm i` / `pnpm dev`; `--update` moves the pin |
| `package.json` scripts | `postinstall`, `dev`, `beatality:update` call it |

`REPO` and `ASSET` are constants for Beatality, so a second external plugin needs the step below once.

## One-time ivan-daw change: fetch any external plugin

A task for an ivan-daw session (it changes root `package.json`, so that goes in its own commit; C6 catalog is unchanged).

1. Each external plugin's `package.json` names its repo and asset:

   ```json
   {
     "name": "@ivandaw/<name>",
     "version": "0.0.0",
     "private": true,
     "description": "<Name>, prebuilt by its CI. dist/ is downloaded by scripts/fetch-plugins.mjs, never built here.",
     "ivandaw": {
       "id": "<id>",
       "repo": "zhirnovcodes/<name>",
       "asset": "<name>-daw.zip",
       "release": "daw-build-1"
     }
   }
   ```

   Add `"repo": "zhirnovcodes/Beatality", "asset": "beatality-daw.zip"` to Beatality's.

2. Rename `scripts/beatality-release.mjs` → `scripts/plugin-release.mjs`. `assetUrl(repo, asset, tag)` takes the repo and asset instead of constants. Other helpers stay. Update its test.
3. Rename `scripts/fetch-beatality.mjs` → `scripts/fetch-plugins.mjs`. It loops over every `plugins/*/package.json` with `ivandaw.repo`, and for each one does what it does for Beatality today (marker file `.release`, offline keeps what is installed, `--update` fails loudly). `--update <name>` moves one pin; `--update` alone moves all.
4. Root `package.json`: `postinstall` and `dev` call `fetch-plugins.mjs`; replace `beatality:update` with `"plugins:update": "node scripts/fetch-plugins.mjs --update"`.
5. `.gitignore`: nothing to do; `dist/` is already ignored everywhere in the repo.
6. `pnpm check` green, commit, push.

## Adding a new plugin (after the step above)

1. Plugin repo: first merge to `master` → release `daw-build-1` exists with `<name>-daw.zip`.
2. ivan-daw: create `plugins/<name>/package.json` as above with `"release": "daw-build-1"`.
3. `pnpm i` → the zip lands in `plugins/<name>/dist/`.
4. `pnpm dev`, add the node from the plugin list, wire it, listen (checklist in [07](07-checklists.md)).
5. Commit `plugins/<name>/package.json` only, message `<name>: pin daw-build-1`.

## Updating a plugin

```
pnpm plugins:update <name>   # moves the pin to the newest daw-build-<n> and fetches it
pnpm dev                     # listen
pnpm check
git commit -m "<name>: pin daw-build-<n> (<what changed>)"
```

Matches the existing commit `Beatality: pin daw-build-4 (retrig fix)`.

## Optional: add the plugin to a demo scene

`apps/daw` demo scenes reference plugins by `id`. Adding one is an ivan-daw task with its own plan entry; plugin repos never touch ivan-daw.

## Port wiring cheat sheet

| Plugin type | Its ports | Wire in IvanDAW |
| --- | --- | --- |
| MIDI generator | `in` events, `out` events (midi) | keyboard / Note hold → generator `in`; generator `out` → instrument `in` |
| MIDI control | `in` events (transport), `out-<k>` modulation | control cable from `out-<k>` to any node's `ctl` (parameter, volume, pan) |
| Instrument | `in` events, `out` audio stereo main | notes → `in`; `out` → Master (auto-cabled when added) |
