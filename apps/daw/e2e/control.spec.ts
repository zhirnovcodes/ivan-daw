import { expect, test } from '@playwright/test';
import { addNode, drag, openDemo, portDot, rms } from './helpers';

// v1.1 T5 + T6 + T7: a control cable from a slider to the sine synth's Level, drawn on the canvas.
test('slider A drives the sine synth level through a control cable', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openDemo(page);
  const sliders = await addNode(page, /Control sliders/);

  await drag(page, portDot(sliders, 'a', 'out'), portDot('n2', 'ctl', 'in'));
  const picker = page.getByRole('menu', { name: 'Control what' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('menuitem')).toHaveText(['Volume', 'Pan', 'Level']);
  await picker.getByRole('menuitem', { name: 'Level' }).click();
  await expect(picker).toHaveCount(0);

  const bound = await page.evaluate(() =>
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
