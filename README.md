# IvanDAW

A node-graph DAW in the browser. Plugins implement the Web Plugin API v2. The host owns routing, timing and the project.

v1 runs on localhost: a note generator plays C3 on every beat into a sine synth, and the synth plays into Master. You can drag the nodes and rewire their cables.

- Design: [docs/tech-design.md](docs/tech-design.md)
- Plugin API: [docs/plugin-api.md](docs/plugin-api.md)
- Shared types and helpers: [ivan-daw-core](https://github.com/zhirnovcodes/ivan-daw-core)

```
pnpm i
pnpm dev      # http://localhost:5173
pnpm check
```

The tooling arrives with task P1.
