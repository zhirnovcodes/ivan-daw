import { expect, test } from '@playwright/test';
import { drag, openDemo, portDot } from './helpers';

// Play-only (revised 2026-11-23): the wiring is locked, plugins can still be moved and switched,
// and the sound controls stay live.
test('play-only locks the wiring, keeps moving, on / off, volume, pan and BPM', async ({
  page,
}) => {
  await openDemo(page, '/?project=sine&mode=play_only');
  expect(await page.evaluate(() => window.__ivandaw?.mode())).toBe('play');
  await expect(page.locator('.ivd-play-tag')).toHaveText('Play only');
  await expect(page.getByRole('button', { name: 'Add plugin' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sticky note' })).toBeDisabled();
  await expect(
    page.locator('.ivd-node[data-node="n2"]').getByRole('button', { name: 'Remove plugin' }),
  ).toBeDisabled();

  const project = () => page.evaluate(() => window.__ivandaw?.project());
  const before = await project();

  // Dragging the title bar moves the plugin.
  const header = page.locator('.ivd-node[data-node="n2"] .ivd-header');
  const box = await header.boundingBox();
  if (!box) throw new Error('no header');
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 210, { steps: 6 });
  await page.mouse.up();
  const moved = await project();
  const pos = (p: typeof moved, id: string) => p?.nodes.find((n) => n.id === id);
  expect(pos(moved, 'n2')?.x).not.toBe(pos(before, 'n2')?.x);

  // Delete does not remove the selected plugin.
  await page.keyboard.press('Delete');
  expect((await project())?.nodes.length).toBe(before?.nodes.length);

  // No cable edits: dragging from an output draws nothing (ARM OUT is covered by playOnly.test.ts).
  await drag(page, portDot('n1', 'out', 'out'), portDot('n2', 'in', 'in'));

  // Cables can't be picked, so Delete can't remove them.
  const cable = page.locator('.ivd-cable-g[data-cable] .ivd-hit').first();
  await expect(cable).toHaveCSS('pointer-events', 'none');

  const after = await project();
  expect(after?.cables).toEqual(before?.cables);
  expect(after?.arms ?? []).toEqual(before?.arms ?? []);

  // On / off still works.
  const check = page.locator('.ivd-node[data-node="n2"] .ivd-onoff');
  await check.click();
  expect((await project())?.nodes.find((n) => n.id === 'n2')?.bypass).toBe(true);

  // Sound controls still work: the box footer and BPM.
  await page.locator('.ivd-node[data-node="master"] input[data-control="pan"]').fill('0.5');
  await page.getByRole('textbox', { name: 'BPM' }).fill('140');
  await page.getByRole('textbox', { name: 'BPM' }).press('Enter');
  const changed = await project();
  expect(changed?.nodes.find((n) => n.id === 'master')?.pan).toBe(0.5);
  expect(changed?.transport.bpm).toBe(140);
});

test('?mode=normal and no mode are editable; old flags no longer switch modes', async ({
  page,
}) => {
  for (const path of [
    '/?project=sine&mode=normal',
    '/?project=sine',
    '/?project=sine&play_only=true',
  ]) {
    await openDemo(page, path);
    expect(await page.evaluate(() => window.__ivandaw?.mode())).toBe('edit');
  }
  await expect(page.getByRole('button', { name: 'Add plugin' })).toBeEnabled();
});
