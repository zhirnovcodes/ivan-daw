// Test-only plugins and projects, served by intercepting requests in the browser. Nothing here
// touches plugins/ or the catalog code (C6): the real /plugins/catalog.json is fetched and the
// fixture entries are appended to it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

const dir = join(import.meta.dirname, 'fixtures');

const events = (id: 'in' | 'out', accepts: string[]) => ({
  id,
  label: id,
  kind: 'events',
  direction: id,
  accepts,
});
const audioOut = {
  id: 'out',
  label: 'out',
  kind: 'audio',
  direction: 'out',
  channels: 2,
  main: true,
};

export const TRANSPOSE = 'test.e2e.transpose';
export const BROKEN_CREATE = 'test.e2e.broken-create';
/** Its "dist" has a manifest (the catalog entry) but no index.js: the import 404s. */
export const NO_INDEX = 'test.e2e.no-index';

interface Fixture {
  entry: { id: string; name: string; kind: string; ports: unknown[] };
  /** Folder under e2e/fixtures holding index.js; undefined = index.js is missing. */
  folder?: string;
}

const FIXTURES: Fixture[] = [
  {
    folder: 'transpose',
    entry: {
      id: TRANSPOSE,
      name: 'E2E transpose',
      kind: 'midi',
      ports: [events('in', ['midi', 'transport']), events('out', ['midi'])],
    },
  },
  {
    folder: 'broken-create',
    entry: {
      id: BROKEN_CREATE,
      name: 'E2E broken create',
      kind: 'instrument',
      ports: [events('in', ['midi']), audioOut],
    },
  },
  {
    entry: {
      id: NO_INDEX,
      name: 'E2E no index',
      kind: 'instrument',
      ports: [events('in', ['midi']), audioOut],
    },
  },
];

/** Adds the fixture plugins to the catalog and serves their code. Call before page.goto. */
export async function installFixturePlugins(page: Page): Promise<void> {
  await page.route('**/plugins/catalog.json', async (route) => {
    const res = await route.fetch();
    const catalog = (await res.json()) as { plugins: unknown[] };
    for (const f of FIXTURES) {
      catalog.plugins.push({ ...f.entry, url: `/plugins/${f.entry.id}/index.js` });
    }
    await route.fulfill({ response: res, json: catalog });
  });
  for (const f of FIXTURES) {
    const folder = f.folder;
    // Vite's dev client adds `?import` to dynamic imports, so match the path, not the full URL.
    const path = `/plugins/${f.entry.id}/index.js`;
    await page.route(
      (url) => url.pathname === path,
      (route) =>
        folder
          ? route.fulfill({
              contentType: 'text/javascript',
              body: readFileSync(join(dir, folder, 'index.js'), 'utf8'),
            })
          : route.fulfill({ status: 404, body: 'not found' }),
    );
  }
}

export interface FixtureNode {
  id: string;
  plugin: string;
}

/** Serves a project at /projects/<name>.json (nodes in a row, then Master); open it with `?project=<name>`. */
export async function serveProject(
  page: Page,
  name: string,
  nodes: FixtureNode[],
  cables: [string, string, string, string][],
): Promise<void> {
  const node = (id: string, plugin: string, i: number) => ({
    id,
    plugin,
    x: 60 + 260 * i,
    y: 120,
    gain: 1,
    pan: 0,
    bypass: false,
    params: {},
  });
  const project = {
    format: 'ivandaw.project',
    version: 1,
    transport: { bpm: 120, numerator: 4, denominator: 4 },
    nodes: [
      ...nodes.map((n, i) => node(n.id, n.plugin, i)),
      node('master', 'builtin.master', nodes.length),
    ],
    cables: cables.map(([fn, fp, tn, tp], i) => ({
      id: `c${i + 1}`,
      from: { node: fn, port: fp },
      to: { node: tn, port: tp },
    })),
  };
  await page.route(`**/projects/${name}.json`, (route) => route.fulfill({ json: project }));
}

/** Waits until every node has left 'loading'; returns node id → status. */
export async function settled(page: Page): Promise<Record<string, string>> {
  let status: Record<string, string> = {};
  await expect
    .poll(
      async () => {
        status = await page.evaluate(() => {
          const h = window.__ivandaw;
          if (!h) return {};
          const s = h.status();
          return Object.fromEntries(h.project().nodes.map((n) => [n.id, s[n.id] ?? 'loading']));
        });
        const values = Object.values(status);
        return values.length > 0 && values.every((s) => s !== 'loading');
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return status;
}
