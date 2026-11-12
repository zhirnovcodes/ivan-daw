# IvanDAW: rules for agents

IvanDAW is a node-graph DAW in the browser. v1 runs on localhost only: no hosting, no CI server.

- Design: `docs/tech-design.md`. Read the sections your task names.
- Plugin API: `docs/plugin-api.md`.
- Both are copies of Claude Docs. Change them only when Ivan asks.

## Repos

| Repo | Package | Holds |
| --- | --- | --- |
| zhirnovcodes/ivan-daw (this one) | `ivandaw` | DAW app and first-party plugins, as a pnpm workspace |
| zhirnovcodes/ivan-daw-core | `ivandaw-core` | API v2 types, timing math, MIDI helpers, Envelope / Smoother |

This repo installs core from a git tag: `github:zhirnovcodes/ivan-daw-core#vX.Y.Z`.
In a cloud session, attach both repos, or the install fails (the GitHub proxy refuses repos that aren't attached).

## Folder map

| Folder | Owned by part |
| --- | --- |
| `apps/daw/src/contracts`, `model`, `store` | P2 (read-only afterwards) |
| `apps/daw/src/engine` | P3 |
| `apps/daw/src/scheduler` | P4 |
| `apps/daw/src/canvas` | P5 |
| `apps/daw/src/router` | P8 |
| `apps/daw/src/panels` | P9 |
| `apps/daw/src/app` | P11 |
| `apps/daw/e2e` | P10 |
| `plugins/base-sine-synth` | P6 |
| `plugins/note-gen` | P7 |
| `docs` | Ivan |

## Commands (P1 creates them)

- `pnpm i`
- `pnpm dev` serves http://localhost:5173.
- `pnpm check` runs typecheck, Biome, Vitest and Playwright. Run it before every PR.
- `pnpm review <PR>` is for Ivan's PC only.

Use Node >= 22: cloud sessions run Node 22, the PC runs Node 24. Use pnpm 10 through corepack.

## Rules

- Touch only the folders your task lists.
- `apps/daw/src/contracts` and ivandaw-core are read-only unless the task says otherwise.
- Root `package.json` and `pnpm-lock.yaml` change only in their own PR.
- If you need a contract change, stop. Add the `blocked` label and say why in the PR.
- Never call `new AudioContext()` outside `apps/daw/src/engine`.
- Keep all timing in AudioContext seconds. Never use `setTimeout` or `setInterval` for musical timing: use `createTicker` and the lookahead helpers from ivandaw-core.
- Every sound start, stop or change gets a fade. See "Fades and clicks" in the tech design.
- Logic gets Vitest tests. You cannot hear, so the PR says exactly what Ivan should listen for.

## Branches and pull requests

- One branch per task: `task/<part>-<slug>`, for example `task/P5-canvas`. Never commit to `main`.
- Open the PR only after `pnpm check` passes.
- Cloud sessions block `gh pr` and `gh issue`. Use REST through `gh api`:
  ```
  gh api repos/zhirnovcodes/ivan-daw/pulls -f title='[ready-to-test] P5 Canvas' \
    -f head=task/P5-canvas -f base=main -F body=@pr-body.md
  gh api repos/zhirnovcodes/ivan-daw/issues/<number>/labels -f 'labels[]=ready-to-test'
  ```
  If these fail, say so in the session; Ivan will tap Create PR.
- Labels:
  - `ready-to-test`: there is something to hear or see. Also prefix the title with `[ready-to-test]`.
  - `checks-only`: logic or tooling only.
  - `blocked`: you need a decision.
- A `ready-to-test` PR body ends with:
  ```
  ## Test on localhost
  1. pnpm review <PR>
  2. <what to click>
  3. Expect: <what Ivan should hear or see>
  4. Reply "ok" or describe what you heard
  ```
- Fixes Ivan asks for go on the same branch.
