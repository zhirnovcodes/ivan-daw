import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// Mobile mode (2026-11-26): play-only for touch screens. A drag anywhere pans the camera, plugin
// windows are covered (unless the catalog says mobileCover: false), Master stays usable.
test('mobile: covered plugins, finger pan, Master and BPM still work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemo(page, '/?project=sine&mode=mobile');
  expect(await page.evaluate(() => window.__ivandaw?.mode())).toBe('mobile');
  await expect(page.locator('html')).toHaveClass(/ivd-mobile/);
  await expect(page.getByRole('button', { name: 'Add plugin' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sticky note' })).toHaveCount(0);
  await expect(page.locator('.ivd-play-tag')).toHaveCount(0);

  // Plugin windows are covered and inert, with no on / off box or buttons; Master is not covered.
  const n2 = page.locator('.ivd-node[data-node="n2"]');
  await expect(n2).toHaveClass(/ivd-covered/);
  expect(await n2.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await expect(n2.locator('.ivd-onoff')).toHaveCount(0);
  await expect(page.locator('.ivd-node[data-node="master"]')).not.toHaveClass(/ivd-covered/);

  // A drag over a plugin's title bar pans the camera and leaves the plugin where it was.
  const project = () => page.evaluate(() => window.__ivandaw?.project());
  const camera = () => page.evaluate(() => window.__ivandaw?.camera());
  const before = await project();
  const cam = await camera();
  const box = await n2.locator('.ivd-header').boundingBox();
  if (!box) throw new Error('no header');
  await page.mouse.move(box.x + 20, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 68, { steps: 6 });
  await page.mouse.up();
  const after = await project();
  expect(after?.nodes).toEqual(before?.nodes);
  const moved = await camera();
  expect(moved?.x).not.toBe(cam?.x);

  // The page scrollbars are there and still move the camera.
  const thumb = page.locator('.ivd-sbar.h .ivd-sbar-thumb');
  await expect(thumb).toBeVisible();
  await expect(page.locator('.ivd-sbar.v')).toBeVisible();
  const tb = await thumb.boundingBox();
  if (!tb) throw new Error('no thumb');
  const camBefore = await camera();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 + 30, tb.y + tb.height / 2, { steps: 4 });
  await page.mouse.up();
  expect((await camera())?.x).not.toBe(camBefore?.x);

  // Master's Volume / Pan (top bar) and BPM − / + still change the sound.
  await page.getByRole('slider', { name: 'Master pan' }).fill('0.5');
  const bpm = (await project())?.transport.bpm ?? 0;
  await page.getByRole('button', { name: 'Faster' }).click();
  const changed = await project();
  expect(changed?.nodes.find((n) => n.id === 'master')?.pan).toBe(0.5);
  expect(changed?.transport.bpm).toBeGreaterThan(bpm);
});

test('the catalog leaves MusicHands uncovered on mobile and covers the rest', async ({ page }) => {
  const res = await page.request.get('/plugins/catalog.json');
  const { plugins } = (await res.json()) as { plugins: { id: string; mobileCover?: boolean }[] };
  const hands = plugins.find((p) => p.id === 'com.ivandaw.musichands');
  if (hands) expect(hands.mobileCover).toBe(false);
  for (const p of plugins.filter((x) => x.id !== 'com.ivandaw.musichands')) {
    expect(p.mobileCover, p.id).toBe(true);
  }
});
