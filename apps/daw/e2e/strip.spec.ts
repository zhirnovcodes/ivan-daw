import { expect, test } from '@playwright/test';

// v1.1 T3: volume and pan sliders on every box with a main audio out, and on Master.
test('box footers set volume and pan, Master included', async ({ page }) => {
  await page.goto('/?project=sine');
  const node = (id: string) => page.locator(`.ivd-node[data-node="${id}"]`);
  await expect(node('n2').locator('.ivd-foot')).toBeVisible();
  await expect(node('master').locator('.ivd-foot')).toBeVisible();
  // The note generator has no audio out, so no footer.
  await expect(node('n1').locator('.ivd-foot')).toHaveCount(0);

  await node('n2').locator('input[data-control="gain"]').fill('0.5');
  await node('master').locator('input[data-control="pan"]').fill('-0.75');

  const strip = (id: string) =>
    page.evaluate((nid) => {
      const n = window.__ivandaw?.project().nodes.find((x) => x.id === nid);
      return n ? { gain: n.gain, pan: n.pan } : undefined;
    }, id);
  expect(await strip('n2')).toEqual({ gain: 0.5, pan: 0 });
  expect(await strip('master')).toEqual({ gain: 1, pan: -0.75 });
});
