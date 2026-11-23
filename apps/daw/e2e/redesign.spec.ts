import { expect, test } from '@playwright/test';
import { openDemo, rms } from './helpers';

// v1.2 T4: sticky notes.
test('a sticky note: create, format, move, delete', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page);
  await page.getByRole('button', { name: 'Sticky note' }).click();
  await page.keyboard.type('**hi** <https://example.com/a>');
  await page.locator('.ivd-canvas').click({ position: { x: 1500, y: 900 } });
  const note = page.locator('.ivd-note[data-note]');
  await expect(note.locator('b')).toHaveText('hi');
  await expect(note.locator('a')).toHaveAttribute('href', 'https://example.com/a');
  await expect(note.locator('a')).toHaveAttribute('target', '_blank');
  const notes = () => page.evaluate(() => window.__ivandaw?.project().notes);
  expect((await notes())?.[0]?.text).toBe('**hi** <https://example.com/a>');

  const bar = await note.locator('.w95-titlebar').boundingBox();
  if (!bar) throw new Error('no title bar');
  const before = (await notes())?.[0];
  await page.mouse.move(bar.x + 30, bar.y + 8);
  await page.mouse.down();
  await page.mouse.move(bar.x + 130, bar.y + 58, { steps: 5 });
  await page.mouse.up();
  const after = (await notes())?.[0];
  expect(after?.x).toBe((before?.x ?? 0) + 100);
  expect(after?.y).toBe((before?.y ?? 0) + 50);

  await note.getByRole('button', { name: 'Delete note' }).click();
  expect(await notes()).toBeUndefined();
});

test('play-only shows notes but cannot add or edit them', async ({ page }) => {
  await openDemo(page, '/play_only');
  await expect(page.getByRole('button', { name: 'Sticky note' })).toBeDisabled();
});

// v1.2 T5 + T6: window buttons.
test('the on / off box silences a plugin; ? opens its info note', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page);
  const beat = page.locator('.ivd-node[data-node="n2"]');
  await beat.getByRole('button', { name: 'About this plugin' }).click();
  await expect(page.locator('.ivd-info-note[data-info="n2"]')).toContainText('Beatality');
  await beat.getByRole('button', { name: 'About this plugin' }).click();
  await expect(page.locator('.ivd-info-note')).toHaveCount(0);

  await page.evaluate(() => window.__ivandaw?.play());
  await expect.poll(() => rms(page), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await beat.getByRole('checkbox', { name: 'Plugin on' }).uncheck();
  await expect.poll(() => rms(page), { timeout: 2_000 }).toBeLessThan(0.001);
  await beat.getByRole('checkbox', { name: 'Plugin on' }).check();
  await expect.poll(() => rms(page), { timeout: 3_000 }).toBeGreaterThan(0.01);
  await page.evaluate(() => window.__ivandaw?.stop());
});

test('X removes a plugin at once; there is no right-hand panel', async ({ page }) => {
  await openDemo(page);
  await page.locator('.ivd-node[data-node="n3"] .ivd-header').click();
  await expect(page.locator('.ivp-node')).toHaveCount(0);
  await page
    .locator('.ivd-node[data-node="n3"]')
    .getByRole('button', { name: 'Remove plugin' })
    .click();
  await expect(page.locator('.ivd-node[data-node="n3"]')).toHaveCount(0);
});

// v1.2: the top panel repeats Master's Volume and Pan; both pairs show the same values.
test('the top panel Master volume and pan follow the Master window', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page);
  const top = page.getByRole('group', { name: 'Master' });
  const win = page.locator('.ivd-node[data-node="master"]');
  await top.getByRole('slider', { name: 'Master volume' }).fill('0.5');
  const master = () =>
    page.evaluate(() => window.__ivandaw?.project().nodes.find((n) => n.id === 'master'));
  expect((await master())?.gain).toBe(0.5);
  await expect(win.getByRole('slider', { name: 'Volume' })).toHaveValue('0.5');

  await win.getByRole('slider', { name: 'Pan' }).fill('-0.5');
  await expect(top.getByRole('slider', { name: 'Master pan' })).toHaveValue('-0.5');
  expect((await master())?.pan).toBe(-0.5);
});
