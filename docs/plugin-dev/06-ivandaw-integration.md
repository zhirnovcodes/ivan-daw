# 06 · Bringing a plugin into IvanDAW

ivan-daw never builds an external plugin. It pins one `daw-build-<n>` release and downloads the zip into `plugins/<name>/dist/`. The catalog then finds it like any first-party plugin. This is how Beatality works today.

## How loading works (no changes needed)

- `apps/daw/vite/plugins-catalog.ts` scans `plugins/*/package.json` for `"ivandaw": { "id" }`.
- It reads `plugins/<name>/dist/manifest.json`, checks `manifest.id` equals `ivandaw.id`, and serves `/plugins/catalog.json`.
- It serves `/plugins/<id>/*` from `plugins/<name>/dist/*`. The DAW `import()`s `/plugins/<id>/index.js` at runtime.
- A package without a `build` script is treated as prebuilt (no watch build).

So a plugin is "in the DAW" as soon as `plugins/<name>/package.json` exists and `dist/` holds the unzipped release.

## The files

| File | Role |
| --- | --- |
| `plugins/<name>/package.json` | the pin: `"ivandaw": { "id", "repo", "asset", "release" }` (see below) |
| `scripts/plugin-release.mjs` | pure helpers: `readPin`, `latestBuild`, `assetUrl(repo, asset, tag)`, `needsFetch`, `safeEntryPath` (Vitest-tested) |
| `scripts/fetch-plugins.mjs` | for every pinned plugin: download + unzip on `pnpm i` / `pnpm dev`; `--update [<name>]` moves pins; `--zip <name> <zip>` installs a local zip |
| `package.json` scripts | `postinstall`, `dev`, `plugins:update` call it |

An external plugin's `package.json`:

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

`repo`, `asset` and `release` go together: a package with only some of them is an error. A package with none is first-party and built here.

Per plugin, `fetch-plugins.mjs` writes the release tag to `dist/.release` and skips the download when it matches the pin. It checks the zip has a `manifest.json` whose `id` equals `ivandaw.id`. A plain run never fails (offline, it keeps what is installed and warns); a failed `--update` exits 1. Logs start with `[plugins] <name>:`.

## Adding a new plugin

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

`pnpm plugins:update` with no name moves every pin.

Test a plugin PR before it merges:

```
# test a plugin PR: download its <name>-daw artifact from the Actions run, then
node scripts/fetch-plugins.mjs --zip <name> ~/Downloads/<name>-daw.zip
pnpm --filter ivandaw dev    # not `pnpm dev`: that fetches first and would restore the pin
```

`--zip` writes `local` into `dist/.release`, so the next `pnpm i` or `pnpm dev` sees it differs from the pin and restores the pinned release. A local test never sticks by accident.

Matches the existing commit `Beatality: pin daw-build-4 (retrig fix)`.

## Optional: add the plugin to a demo scene

`apps/daw` demo scenes reference plugins by `id`. Adding one is an ivan-daw task with its own plan entry; plugin repos never touch ivan-daw.

## Port wiring cheat sheet

| Plugin type | Its ports | Wire in IvanDAW |
| --- | --- | --- |
| MIDI generator | `in` events, `out` events (midi) | keyboard / Note hold → generator `in`; generator `out` → instrument `in` |
| MIDI control | `in` events (transport), `out-<k>` modulation | control cable from `out-<k>` to any node's `ctl` (parameter, volume, pan) |
| Instrument | `in` events, `out` audio stereo main | notes → `in`; `out` → Master (auto-cabled when added) |
