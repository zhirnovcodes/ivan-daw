import { expect, test } from '@playwright/test';
import { addNode, drag, openDemo, portDot, rms } from './helpers';

// v1.1 T9 + T12: a held note from Note hold makes Beatality play; Stop silences it.
test('Note hold gates Beatality: sound on Play, silence on Stop', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page);
  // Clear the v1 demo's generator so only Note hold drives anything.
  await page.locator('.ivd-node[data-node="n1"] .ivd-header').click();
  await page.keyboard.press('Delete');

  const hold = await addNode(page, /Note hold/);
  // Move it to the left before Beatality's big box lands in the middle of the view.
  await page
    .locator(`.ivd-node[data-node="${hold}"] .ivd-header`)
    .dragTo(page.locator('.ivd-canvas'), {
      targetPosition: { x: 120, y: 120 },
    });
  const beat = await addNode(page, /Beatality/);
  await drag(page, portDot(hold, 'out', 'out'), portDot(beat, 'in', 'in'));
  await expect
    .poll(() =>
      page.evaluate(
        ([h, b]) =>
          window.__ivandaw?.project().cables.some((c) => c.from.node === h && c.to.node === b),
        [hold, beat],
      ),
    )
    .toBe(true);

  await page.evaluate(() => window.__ivandaw?.play());
  await expect.poll(() => rms(page), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await page.evaluate(() => window.__ivandaw?.stop());
  await expect.poll(() => rms(page), { timeout: 2_000 }).toBeLessThan(0.001);
});
