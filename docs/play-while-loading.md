# Block Play while plugins load

Status: proposal, not built.

## Problem

Pressing Play before plugins finish loading starts the song with some nodes silent.

## What already exists

- `nodeStatus` (`apps/daw/src/store/store.ts`): node id → `'loading' | 'ready' | 'error'`.
- The engine sets `'loading'` when it starts creating a plugin (`engine/engine.ts`), then `'ready'` or `'error'` through `setNodeStatus` (`store/actions.ts`).
- The canvas treats a node with no status yet as loading.

## Change

Only `apps/daw/src/panels/transportBar.ts`:

```ts
import { computed, effect } from '@preact/signals-core';
import { deps, mode, nodeStatus, playing, project } from '../store/store';

// Loading if any node is still loading or has no status yet. 'error' does not block.
const loading = computed(() => {
  const st = nodeStatus.value;
  return project.value.nodes.some((n) => (st[n.id] ?? 'loading') === 'loading');
});

// toggle():
if (playing.peek()) pause();
else if (!loading.peek()) void play();

// new effect:
effect(() => {
  const busy = loading.value && !playing.value; // Pause is never locked
  playBtn.disabled = busy;
  playBtn.title = busy ? 'Loading plugins…' : '';
});
```

The Space shortcut goes through `toggle()`, so it is blocked too.

## Rules

- Block in the UI only. `actions.play()` (contract C4) and `window.__ivandaw.play()` stay as they are, so e2e tests keep working.
- `'error'` does not block: one broken plugin must not lock the transport.
- Adding a plugin while playing does not stop playback; it only blocks the next Play.

## Open

- Grey out only, or also change the label to "Loading…"? Mobile has no hover tooltip.

## Test

- Vitest: the `loading` rule (all ready → false; one loading → true; missing status → true; error → false).
- Localhost: reload a project with Beatality, press Play at once. Expect: Play is greyed until the windows lose "(loading…)", then the song starts with every node sounding.
