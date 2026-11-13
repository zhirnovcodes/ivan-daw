import { expect, test } from '@playwright/test';
import { drag, openDemo, portDot, rms } from './helpers';

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

test('in play-only, the LFO can still be cabled to Beatality', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page, '/play_only');
  await drag(page, portDot('n3', 'out', 'out'), portDot('n2', 'ctl', 'in'));
  const picker = page.getByRole('menu', { name: 'Control what' });
  await expect(picker).toBeVisible();
  // Volume and Pan first, then Beatality's own parameters.
  await expect(picker.getByRole('menuitem').first()).toHaveText('Volume');
  expect(await picker.getByRole('menuitem').count()).toBeGreaterThan(10);
  await picker.getByRole('menuitem', { name: 'Pan', exact: true }).click();
  const bound = await page.evaluate(() =>
    window.__ivandaw?.project().cables.find((c) => c.from.node === 'n3'),
  );
  expect(bound?.to).toEqual({ node: 'n2', port: 'ctl:pan' });
});
