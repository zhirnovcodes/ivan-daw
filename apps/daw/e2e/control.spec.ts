import { expect, type Page, test } from '@playwright/test';

const hook = <T>(page: Page, fn: () => T) => page.evaluate(fn);

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

async function drag(page: Page, from: string, to: string): Promise<void> {
  const a = await page.locator(from).boundingBox();
  const b = await page.locator(to).boundingBox();
  if (!a || !b) throw new Error('port not on screen');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

const rms = (page: Page) => hook(page, () => window.__ivandaw?.rms() ?? 0);

// v1.1 T5 + T6 + T7: a control cable from a slider to the sine synth's Level, drawn on the canvas.
test('slider A drives the sine synth level through a control cable', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  const sliders = await add(page, /Control sliders/);

  await drag(
    page,
    `.ivd-node[data-node="${sliders}"] .ivd-port.out[data-port="a"] i`,
    '.ivd-node[data-node="n2"] .ivd-port.in[data-port="ctl"] i',
  );
  const picker = page.getByRole('menu', { name: 'Control what' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('menuitem')).toHaveText(['Volume', 'Pan', 'Level']);
  await picker.getByRole('menuitem', { name: 'Level' }).click();
  await expect(picker).toHaveCount(0);

  const bound = await hook(page, () =>
    window.__ivandaw?.project().cables.find((c) => c.to.port.startsWith('ctl:')),
  );
  expect(bound?.to).toEqual({ node: 'n2', port: 'ctl:param:level' });
  await expect(page.locator('.ivd-cable-label')).toHaveText('Level');

  // The synth's panel shows the binding and locks its Level slider.
  await page.locator('.ivd-node[data-node="n2"] .ivd-header').click();
  const levelRow = page.locator('.ivp-row[data-param="level"]');
  await expect(levelRow.locator('.ivp-src')).toHaveText('← Control sliders');
  await expect(levelRow.locator('input')).toBeDisabled();

  await page.evaluate(() => window.__ivandaw?.play());
  await expect.poll(() => rms(page), { timeout: 5_000 }).toBeGreaterThan(0.01);

  // Slider A to 0: the level follows, so the beat goes silent while still playing.
  await page.locator(`.ivd-node[data-node="${sliders}"] .ivd-header`).click();
  await page.getByRole('slider', { name: 'Slider A' }).fill('0');
  await expect.poll(() => rms(page), { timeout: 3_000 }).toBeLessThan(0.001);
  await page.getByRole('slider', { name: 'Slider A' }).fill('1');
  await expect.poll(() => rms(page), { timeout: 3_000 }).toBeGreaterThan(0.01);
  await page.evaluate(() => window.__ivandaw?.stop());
});
