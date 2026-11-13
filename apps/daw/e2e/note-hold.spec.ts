import { expect, type Page, test } from '@playwright/test';

async function add(page: Page, name: RegExp): Promise<string> {
  const before = await page.evaluate(
    () => window.__ivandaw?.project().nodes.map((n) => n.id) ?? [],
  );
  await page.getByRole('button', { name: '+ Add' }).click();
  await page.getByRole('menuitem', { name }).click();
  const id = await page.evaluate(
    (prev) => window.__ivandaw?.project().nodes.find((n) => !prev.includes(n.id))?.id,
    before,
  );
  if (!id) throw new Error(`no node added for ${name}`);
  await expect
    .poll(() => page.evaluate((nid) => window.__ivandaw?.status()[nid], id), { timeout: 20_000 })
    .toBe('ready');
  return id;
}

/** Drags a cable from an output port dot to an input port dot. */
async function cable(page: Page, from: [string, string], to: [string, string]): Promise<void> {
  const dot = (node: string, port: string, dir: string) =>
    page.locator(`.ivd-node[data-node="${node}"] .ivd-port.${dir}[data-port="${port}"] i`);
  const a = await dot(from[0], from[1], 'out').boundingBox();
  const b = await dot(to[0], to[1], 'in').boundingBox();
  if (!a || !b) throw new Error('port not on screen');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

// v1.1 T9 + T12: a held note from Note hold makes Beatality play; Stop silences it.
test('Note hold gates Beatality: sound on Play, silence on Stop', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  // Clear the v1 demo's generator so only Note hold drives anything.
  await page.locator('.ivd-node[data-node="n1"] .ivd-header').click();
  await page.keyboard.press('Delete');

  const hold = await add(page, /Note hold/);
  // Move it to the left before Beatality's big box lands in the middle of the view.
  await page
    .locator(`.ivd-node[data-node="${hold}"] .ivd-header`)
    .dragTo(page.locator('.ivd-canvas'), {
      targetPosition: { x: 120, y: 120 },
    });
  const beat = await add(page, /Beatality/);
  await cable(page, [hold, 'out'], [beat, 'in']);
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
  await expect
    .poll(() => page.evaluate(() => window.__ivandaw?.rms() ?? 0), { timeout: 5_000 })
    .toBeGreaterThan(0.01);
  await page.evaluate(() => window.__ivandaw?.stop());
  await expect
    .poll(() => page.evaluate(() => window.__ivandaw?.rms() ?? 1), { timeout: 2_000 })
    .toBeLessThan(0.001);
});
