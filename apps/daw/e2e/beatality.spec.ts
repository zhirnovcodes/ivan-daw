import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// v1.1 T10 + T12: Beatality, from its pinned CI build, loads as a node with its own UI inside the box.
test('Beatality loads from the catalog and shows its UI in its box', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await openDemo(page);
  await page.getByRole('button', { name: '+ Add' }).click();
  await page.getByRole('menuitem', { name: /Beatality/ }).click();

  const id = await page.evaluate(
    () => window.__ivandaw?.project().nodes.find((n) => n.plugin === 'com.beatality.beatality')?.id,
  );
  expect(id).toBeTruthy();
  await expect
    .poll(() => page.evaluate((nid) => window.__ivandaw?.status()[nid as string], id), {
      timeout: 20_000,
    })
    .toBe('ready');

  const box = page.locator(`.ivd-node[data-node="${id}"]`);
  const ui = box.locator('.ivd-ui');
  await expect(ui).toHaveCount(1);
  // The plugin rendered something into the slot.
  await expect.poll(() => ui.evaluate((el) => el.childElementCount)).toBeGreaterThan(0);
  const size = await ui.boundingBox();
  expect(size?.width).toBeCloseTo(746, 0);
  expect(size?.height).toBeCloseTo(638, 0);
  // An instrument from the menu is cabled to Master, and has the volume / pan footer.
  await expect(box.locator('.ivd-foot')).toBeVisible();
  expect(errors).toEqual([]);
});
