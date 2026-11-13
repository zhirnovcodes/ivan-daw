import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// v1.1.2 T2: `-` folds a plugin's UI away; `+` brings back the same UI, still mounted.
test('hide and show Beatality keeps its UI and its state', async ({ page }) => {
  await openDemo(page);
  const node = page.locator('.ivd-node[data-node="n2"]');
  const slot = page.locator('.ivd-ui[data-ui="n2"]');
  await expect(slot).toBeVisible();
  const wide = await node.boundingBox();
  expect(wide?.width).toBeGreaterThan(400);
  // Tag the plugin's own DOM: if the UI were unmounted and mounted again, the tag would be gone.
  await page.evaluate(() => {
    const first = document.querySelector('.ivd-ui[data-ui="n2"] > *');
    if (first instanceof HTMLElement) first.dataset.e2eKept = 'yes';
  });

  await node.getByRole('button', { name: 'Hide plugin' }).click();
  await expect(slot).toBeHidden();
  expect((await node.boundingBox())?.width).toBe(180);
  await expect(node.locator('[data-control="gain"]')).toBeVisible();
  await expect(node.locator('[data-control="pan"]')).toBeVisible();
  const hidden = await page.evaluate(
    () => window.__ivandaw?.project().nodes.find((n) => n.id === 'n2')?.uiHidden,
  );
  expect(hidden).toBe(true);
  // Nodes without their own UI have no button.
  await expect(page.locator('.ivd-node[data-node="master"] .ivd-fold')).toHaveCount(0);

  await node.getByRole('button', { name: 'Show plugin' }).click();
  await expect(slot).toBeVisible();
  expect((await node.boundingBox())?.width).toBe(wide?.width);
  await expect(page.locator('[data-e2e-kept="yes"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.__ivandaw?.status().n2)).toBe('ready');
});

test('the button works in play-only mode too', async ({ page }) => {
  await openDemo(page, '/?play_only');
  const node = page.locator('.ivd-node[data-node="n2"]');
  await node.getByRole('button', { name: 'Hide plugin' }).click();
  await expect(page.locator('.ivd-ui[data-ui="n2"]')).toBeHidden();
});
