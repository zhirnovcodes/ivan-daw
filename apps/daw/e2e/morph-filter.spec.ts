import { expect, test } from '@playwright/test';
import { addNode, openDemo } from './helpers';

// Morph filter: the worklet instantiates the engine-core wasm (status 'ready' waits for it),
// and the node shows its 128 x 128 UI with the two knobs.
test('Morph filter loads its wasm and shows D/W and FREQ', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page);
  const id = await addNode(page, /Morph filter/);
  const box = page.locator(`.ivd-node[data-node="${id}"]`);
  await expect(box.locator('svg text', { hasText: 'D/W' })).toBeVisible();
  await expect(box.locator('svg text', { hasText: 'FREQ' })).toBeVisible();
});
