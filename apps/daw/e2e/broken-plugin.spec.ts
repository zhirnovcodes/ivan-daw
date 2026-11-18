import { expect, test } from '@playwright/test';
import { BROKEN_CREATE, installFixturePlugins, NO_INDEX, serveProject, settled } from './fixtures';
import { rms } from './helpers';

// E2: one broken plugin doesn't break the DAW.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('broken plugins show an error; the rest of the scene still plays', async ({ page }) => {
  await installFixturePlugins(page);
  await serveProject(
    page,
    'e2e-broken',
    [
      { id: 'hold', plugin: 'com.ivandaw.note-hold' },
      { id: 'sine', plugin: 'com.ivandaw.base-sine-synth' },
      { id: 'bad1', plugin: BROKEN_CREATE },
      { id: 'bad2', plugin: NO_INDEX },
    ],
    [
      ['hold', 'out', 'sine', 'in'],
      ['hold', 'out', 'bad1', 'in'],
      ['hold', 'out', 'bad2', 'in'],
      ['sine', 'out', 'master', 'in'],
      ['bad1', 'out', 'master', 'in'],
      ['bad2', 'out', 'master', 'in'],
    ],
  );
  await page.goto('/?project=e2e-broken');
  expect(await settled(page)).toEqual({
    hold: 'ready',
    sine: 'ready',
    bad1: 'error',
    bad2: 'error',
    master: 'ready',
  });
  for (const [id, message] of [
    ['bad1', 'failed to load: fixture: create() always rejects'],
    ['bad2', 'failed to load: Failed to fetch dynamically imported module'],
  ] as const) {
    const box = page.locator(`.ivd-node[data-node="${id}"]`);
    await expect(box).toHaveAttribute('data-status', 'error');
    await expect(box.locator('.ivd-dot')).toHaveAttribute(
      'title',
      new RegExp(`^${escape(message)}`),
    );
  }

  await page.evaluate(() => window.__ivandaw?.play());
  await expect.poll(() => rms(page), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await page.evaluate(() => window.__ivandaw?.stop());
  await expect.poll(() => rms(page), { timeout: 2_000 }).toBeLessThan(0.001);
});

test('a project naming a plugin not in the catalog keeps that node and its cables', async ({
  page,
}) => {
  await installFixturePlugins(page);
  await serveProject(
    page,
    'e2e-missing',
    [
      { id: 'hold', plugin: 'com.ivandaw.note-hold' },
      { id: 'gone', plugin: 'com.example.not-installed' },
      { id: 'sine', plugin: 'com.ivandaw.base-sine-synth' },
    ],
    [
      ['hold', 'out', 'gone', 'in'],
      ['hold', 'out', 'sine', 'in'],
      ['sine', 'out', 'master', 'in'],
    ],
  );
  await page.goto('/?project=e2e-missing');
  const status = await settled(page);
  expect(status.gone).toBe('error');
  expect(status.sine).toBe('ready');

  await page.evaluate(() => window.__ivandaw?.play());
  await expect.poll(() => rms(page), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await page.evaluate(() => window.__ivandaw?.stop());
  // The project (what a save writes) still has the node and its cable.
  const p = await page.evaluate(() => window.__ivandaw?.project());
  expect(p?.nodes.find((n) => n.id === 'gone')?.plugin).toBe('com.example.not-installed');
  expect(p?.cables.some((c) => c.to.node === 'gone')).toBe(true);
});
