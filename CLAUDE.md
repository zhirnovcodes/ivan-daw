# IvanDAW: rules for agents

IvanDAW is a node-graph DAW in the browser. It runs on localhost only: no hosting, no CI server.

- Current work: v1.1.2 (zoom, hide / show plugin UI, pan limits). Plan and design: `docs/v1.1.2-plan.md`.
- v1.1 plan: `docs/v1.1-plan.md`. Design: `docs/v1.1-tech-design.md`.
- v1 design: `docs/tech-design.md`. Plugin API: `docs/plugin-api.md`.
- The design docs are copies of Claude Docs. Change them only when Ivan asks.

## Repos

| Repo | Package | Holds |
| --- | --- | --- |
| zhirnovcodes/ivan-daw (this one) | `ivandaw` | DAW app and first-party plugins, as a pnpm workspace |
| zhirnovcodes/ivan-daw-core | `ivandaw-core` | API v2 types, timing math, MIDI helpers, Envelope / Smoother |
| zhirnovcodes/Beatality | – | Beatality. Worked on in its own session; this repo only fetches its pinned `daw-build-<n>` release |

This repo installs core from a git tag: `github:zhirnovcodes/ivan-daw-core#vX.Y.Z`.
In a cloud session, attach both repos, or the install fails (the GitHub proxy refuses repos that aren't attached).

## Folder map

v1 parts built these folders; v1.1 tasks (see the plan) change them as each task says.

| Folder | Built by |
| --- | --- |
| `apps/daw/src/contracts`, `model`, `store` | P2 |
| `apps/daw/src/engine` | P3 |
| `apps/daw/src/scheduler` | P4 |
| `apps/daw/src/canvas` | P5 |
| `apps/daw/src/router` | P8 |
| `apps/daw/src/panels` | P9 |
| `apps/daw/src/app` | P11 |
| `apps/daw/e2e` | P10 |
| `plugins/base-sine-synth` | P6 |
| `plugins/note-gen` | P7 |
| `plugins/note-hold`, `lfo`, `control-sliders`, `beatality` | v1.1 (T7–T12) |
| `docs` | Ivan |

## Contracts (P2)

| # | Contract | File |
| --- | --- | --- |
| C1 | Plugin API v2 types | ivandaw-core `src/api.ts` |
| C2 | Timing math, ticker | ivandaw-core `src/transport.ts` |
| C3 | Project schema | `apps/daw/src/model/project.ts` |
| C4 | Store signals and actions | `apps/daw/src/store/store.ts`, `actions.ts` |
| C5 | Engine, Scheduler, Router, UI mount | `apps/daw/src/contracts/{engine,scheduler,router,ui}.ts` |
| C6 | Plugin catalog and folder layout | `apps/daw/src/model/catalog.ts` |
| C7 | Test hook `window.__ivandaw` | `apps/daw/src/contracts/testHook.ts` |

The store gets its services through `provide({ scheduler, router, manifests })`.

## Commands

- `pnpm i`
- `pnpm dev` serves http://localhost:5173.
- `pnpm check` runs typecheck, Biome, Vitest and Playwright. Run it before every push.

Use Node >= 22: cloud sessions run Node 22, the PC runs Node 24. Use pnpm 10 through corepack.

## Rules

- Touch only the folders your task lists.
- Contracts change only as the v1.1 design's "Contract changes" table says. Any other contract change: stop and ask Ivan in the session.
- Root `package.json` and `pnpm-lock.yaml` change only in their own commit.
- Never call `new AudioContext()` outside `apps/daw/src/engine`.
- Keep all timing in AudioContext seconds. Never use `setTimeout` or `setInterval` for musical timing: use `createTicker` and the lookahead helpers from ivandaw-core.
- Every sound start, stop or change gets a fade. See "Fades and clicks" in the v1 tech design.
- Logic gets Vitest tests. You cannot hear, so each check says exactly what Ivan should listen for.

## Commits (v1.1 onwards)

- Commit straight to `main`, one commit (or a few) per plan task, message starting with the task id, for example `T2: camera pan`.
- Push only after `pnpm check` passes.
- No pull requests or labels in this repo. Beatality keeps PRs, in its own repo and session.
- A task marked **check** in the plan ends with this in the session, then waits for Ivan's "ok" before dependent tasks:
  ```
  ## Test on localhost
  1. git pull && pnpm i && pnpm dev
  2. <what to open and click>
  3. Expect: <what Ivan should hear or see>
  4. Reply "ok" or describe what you heard
  ```
- Tasks marked **blocked by B** wait until Ivan says Blocker B (Beatality release ready) is cleared.
- Fixes Ivan asks for go in follow-up commits on `main`.
