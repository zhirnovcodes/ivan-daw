import { expect, test } from '@playwright/test';
import { drag, openDemo, portDot } from './helpers';

// v1.1 T4: /play_only locks the graph but keeps the sound controls live.
test('play-only locks the graph, keeps volume, pan and BPM', async ({ page }) => {
  await openDemo(page, '/play_only');
  expect(await page.evaluate(() => window.__ivandaw?.mode())).toBe('play');
  await expect(page.locator('.ivd-play-tag')).toHaveText('Play only');
  await expect(page.getByRole('button', { name: '+ Add' })).toBeHidden();

  const project = () => page.evaluate(() => window.__ivandaw?.project());
  const before = await project();

  // No node drag, no node removal (Delete key or panel button).
  const header = page.locator('.ivd-node[data-node="n2"] .ivd-header');
  const box = await header.boundingBox();
  if (!box) throw new Error('no header');
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 210, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);

  // No notes or audio cable edits: dragging from note-gen's out draws nothing.
  await drag(page, portDot('n1', 'out', 'out'), portDot('n2', 'in', 'in'));

  const after = await project();
  expect(after?.nodes).toEqual(before?.nodes);
  expect(after?.cables).toEqual(before?.cables);

  // Sound controls still work: the box footer and BPM.
  await page.locator('.ivd-node[data-node="master"] input[data-control="pan"]').fill('0.5');
  await page.getByRole('spinbutton', { name: 'BPM' }).fill('140');
  await page.getByRole('spinbutton', { name: 'BPM' }).press('Enter');
  const changed = await project();
  expect(changed?.nodes.find((n) => n.id === 'master')?.pan).toBe(0.5);
  expect(changed?.transport.bpm).toBe(140);
});

test('?play_only works too, and the plain page stays editable', async ({ page }) => {
  await openDemo(page, '/?play_only');
  expect(await page.evaluate(() => window.__ivandaw?.mode())).toBe('play');
  await openDemo(page, '/');
  expect(await page.evaluate(() => window.__ivandaw?.mode())).toBe('edit');
  await expect(page.getByRole('button', { name: '+ Add' })).toBeVisible();
});
