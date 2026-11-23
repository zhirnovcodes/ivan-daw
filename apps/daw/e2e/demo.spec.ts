import { expect, test } from '@playwright/test';
import { armDot, drag, openDemo, rms } from './helpers';

// v1.1 T13: the demo scene. Note hold -> Beatality -> Master is cabled; LFO and Control sliders wait.
test('the demo plays Beatality from a held note', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page);
  const nodes = await page.evaluate(() => window.__ivandaw?.project().nodes.map((n) => n.plugin));
  expect(nodes).toEqual([
    'com.ivandaw.note-hold',
    'com.beatality.beatality',
    'com.ivandaw.lfo',
    'com.ivandaw.control-sliders',
    'builtin.master',
  ]);
  const cables = await page.evaluate(() => window.__ivandaw?.project().cables.length);
  expect(cables).toBe(2);

  await page.evaluate(() => window.__ivandaw?.play());
  await expect.poll(() => rms(page), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await page.evaluate(() => window.__ivandaw?.stop());
  await expect.poll(() => rms(page), { timeout: 2_000 }).toBeLessThan(0.001);
});

test('in play-only, ARM connectors are locked', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page, '/play_only');
  await drag(page, armDot('n3', 1, 'out'), armDot('n2', 1, 'in'));
  await expect(page.locator('.ivd-conn')).toHaveCount(0);
  expect(await page.evaluate(() => window.__ivandaw?.project().arms ?? [])).toEqual([]);
});

test('the LFO can be linked to Beatality over ARM', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page, '/');
  await drag(page, armDot('n3', 1, 'out'), armDot('n2', 1, 'in'));
  const conn = page.locator('.ivd-conn');
  await expect(conn).toBeVisible();
  // The LFO has one output, so Out is picked already. In: Volume, Pan, then Beatality's parameters.
  await expect(conn.getByRole('combobox', { name: 'Out' })).toHaveValue('out');
  const ins = conn.getByRole('combobox', { name: 'In' }).locator('option');
  await expect(ins.nth(1)).toHaveText('Volume');
  expect(await ins.count()).toBeGreaterThan(10);
  await conn.getByRole('combobox', { name: 'In' }).selectOption('ctl:pan');
  const arm = await page.evaluate(() => window.__ivandaw?.project().arms?.[0]);
  expect(arm).toMatchObject({
    from: { node: 'n3', index: 1 },
    to: { node: 'n2', index: 1 },
    source: 'out',
    target: 'ctl:pan',
  });
});
