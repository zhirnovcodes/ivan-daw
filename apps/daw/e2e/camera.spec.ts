import { expect, test } from '@playwright/test';

// v1.1 T2: the camera moves with a right-drag and with wheel / two-finger scroll; nodes move with it.
test('right-drag and wheel pan the canvas', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.ivd-canvas');
  await expect(canvas).toBeVisible();
  const node = page.locator('.ivd-node[data-node="n1"]');
  await expect(node).toBeVisible();
  const camera = () => page.evaluate(() => window.__ivandaw?.camera());
  expect(await camera()).toEqual({ x: 0, y: 0 });

  const before = await node.boundingBox();
  const box = await canvas.boundingBox();
  if (!before || !box) throw new Error('no layout');

  // Right-drag 120 px right and 40 px down: the view follows the hand, so the camera moves the other way.
  const start = { x: box.x + box.width - 60, y: box.y + box.height - 60 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(start.x - 120, start.y - 40, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  expect(await camera()).toEqual({ x: 120, y: 40 });

  const after = await node.boundingBox();
  if (!after) throw new Error('node gone');
  expect(after.x).toBeCloseTo(before.x - 120, 0);
  expect(after.y).toBeCloseTo(before.y - 40, 0);
  // Panning is a view change only: the project keeps the node where it was.
  const pos = await page.evaluate(() => {
    const n = window.__ivandaw?.project().nodes.find((x) => x.id === 'n1');
    return n ? { x: n.x, y: n.y } : undefined;
  });
  expect(pos).toEqual({ x: 80, y: 160 });

  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.wheel(30, -20);
  await expect.poll(camera).toEqual({ x: 150, y: 20 });
});
