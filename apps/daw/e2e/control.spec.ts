import { expect, test } from '@playwright/test';
import { addNode, armDot, drag, openDemo, rms } from './helpers';

// v1.2 T8: an ARM link from Control sliders to the sine synth's Level, set up in the connection window.
test('slider A drives the sine synth level through an ARM link', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page, '/?project=sine');
  const sliders = await addNode(page, /Control sliders/);
  await page
    .locator(`.ivd-node[data-node="${sliders}"] .ivd-header`)
    .dragTo(page.locator('.ivd-canvas'), { targetPosition: { x: 200, y: 420 } });

  await drag(page, armDot(sliders, 1, 'out'), armDot('n2', 1, 'in'));
  const conn = page.locator('.ivd-conn');
  await expect(conn).toBeVisible();
  await expect(conn.locator('.w95-caption')).toHaveText(
    '"Control sliders".1 - "Base sine synth".1',
  );
  // Not valid yet: Control sliders has two outputs, so Out waits too.
  await expect(page.locator('[data-arm] .ivd-cable.invalid')).toHaveCount(1);
  await conn.getByRole('combobox', { name: 'Out' }).selectOption('a');
  await expect(conn.getByRole('combobox', { name: 'In' }).locator('option')).toHaveText([
    '—',
    'Volume',
    'Pan',
    'Level',
  ]);
  await conn.getByRole('combobox', { name: 'In' }).selectOption('ctl:param:level');
  await expect(page.locator('[data-arm] .ivd-cable.invalid')).toHaveCount(0);

  const arm = await page.evaluate(() => window.__ivandaw?.project().arms?.[0]);
  expect(arm).toMatchObject({ source: 'a', target: 'ctl:param:level', min: 0, max: 100 });
  // The synth's own Level row is locked while the link drives it.
  await expect(
    page.locator('.ivd-node[data-node="n2"] .ivp-prow[data-param="level"] input'),
  ).toBeDisabled();

  await page.evaluate(() => window.__ivandaw?.play());
  await expect.poll(() => rms(page), { timeout: 5_000 }).toBeGreaterThan(0.01);

  // Slider A to 0: the level follows, so it goes silent while still playing.
  const sliderA = page
    .locator(`.ivd-node[data-node="${sliders}"]`)
    .getByRole('slider', { name: 'Slider A' });
  await sliderA.fill('0');
  await expect.poll(() => rms(page), { timeout: 3_000 }).toBeLessThan(0.001);
  await sliderA.fill('1');
  await expect.poll(() => rms(page), { timeout: 3_000 }).toBeGreaterThan(0.01);

  // Max 0 / Min 100 flips it: slider A at 1 is now silent.
  await page.locator('[data-arm] .ivd-hit').click({ force: true });
  await conn.getByRole('textbox', { name: 'Min %' }).fill('100');
  await conn.getByRole('textbox', { name: 'Min %' }).press('Enter');
  await conn.getByRole('textbox', { name: 'Max %' }).fill('0');
  await conn.getByRole('textbox', { name: 'Max %' }).press('Enter');
  await expect.poll(() => rms(page), { timeout: 3_000 }).toBeLessThan(0.001);
  await page.evaluate(() => window.__ivandaw?.stop());

  // Delete removes the selected link and closes its window.
  await page.keyboard.press('Delete');
  await expect(conn).toHaveCount(0);
  expect(await page.evaluate(() => window.__ivandaw?.project().arms)).toBeUndefined();
});
