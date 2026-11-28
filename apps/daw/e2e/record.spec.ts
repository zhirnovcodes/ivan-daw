// Record button (2026-11-28): Master to MP3, all in the browser.
import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

const bar = (page: import('@playwright/test').Page) =>
  page.getByRole('toolbar', { name: 'Transport' });
const recBtn = (page: import('@playwright/test').Page) => page.locator('.ivp-rec');
const recCap = (page: import('@playwright/test').Page) => page.locator('.ivp-rec-cap');

test('Record waits for Play, records, and Stop offers the MP3', async ({ page }) => {
  await openDemo(page);
  const rec = recBtn(page);
  await expect(rec).toHaveAttribute('data-state', 'off');
  await expect(recCap(page)).toHaveText('REC');
  // Circle, then time, then Play.
  const [r, c, p] = await Promise.all([
    rec.boundingBox(),
    recCap(page).boundingBox(),
    bar(page).getByRole('button', { name: 'Play', exact: true }).boundingBox(),
  ]);
  expect((r?.x ?? 0) < (c?.x ?? 0) && (c?.x ?? 0) < (p?.x ?? 0)).toBe(true);

  await rec.click();
  await expect(rec).toHaveAttribute('data-state', 'armed');
  await expect(recCap(page)).toHaveText('5:00');
  await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(rec).toHaveAttribute('data-state', 'recording');
  await page.waitForTimeout(1500);
  await expect(recCap(page)).toHaveText(/^4:5\d$/);

  // Pause keeps recording.
  await bar(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(rec).toHaveAttribute('data-state', 'recording');

  await bar(page).getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(rec).toHaveAttribute('data-state', 'off');
  const box = page.getByRole('alertdialog', { name: 'Recording' });
  await expect(box).toContainText('Save progress?');

  // Keep the Blob the download is made from, to look at its bytes.
  await page.evaluate(() => {
    const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => {
      (window as unknown as { lastBlob: unknown }).lastBlob = b;
      return make(b);
    };
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    box.getByRole('button', { name: 'Yes' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^IvanDAW \d{4}-\d\d-\d\d \d\d-\d\d-\d\d\.mp3$/);
  const bytes = await page.evaluate(async () => {
    const b = (window as unknown as { lastBlob: Blob }).lastBlob;
    const head = new Uint8Array(await b.slice(0, 2).arrayBuffer());
    return { length: b.size, 0: head[0], 1: head[1] };
  });
  // About 1.5 s at 192 kbps ≈ 36 KB; MPEG audio frame sync is 11 set bits.
  expect(bytes.length).toBeGreaterThan(20_000);
  expect(bytes.length).toBeLessThan(200_000);
  expect(bytes[0]).toBe(0xff);
  expect((bytes[1] ?? 0) & 0xe0).toBe(0xe0);
  await expect(box).toHaveCount(0);
});

test('Record again during play offers to save; No asks again', async ({ page }) => {
  await openDemo(page);
  const rec = recBtn(page);
  await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
  await rec.click(); // already playing: straight to recording
  await expect(rec).toHaveAttribute('data-state', 'recording');
  await page.waitForTimeout(300);
  await rec.click();
  await expect(rec).toHaveAttribute('data-state', 'off');
  await expect(recCap(page)).toHaveText('REC');
  // Playback goes on.
  await expect(bar(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const box = page.getByRole('alertdialog', { name: 'Recording' });
  await box.getByRole('button', { name: 'No' }).click();
  await expect(box).toContainText('Are you sure? Your recording will be deleted');
  await box.getByRole('button', { name: 'No' }).click(); // back to the question
  await expect(box).toContainText('Save progress?');
  await box.getByRole('button', { name: 'No' }).click();
  await box.getByRole('button', { name: 'Yes' }).click();
  await expect(box).toHaveCount(0);
});

test('armed Record disarms on a second press', async ({ page }) => {
  await openDemo(page);
  const rec = recBtn(page);
  await rec.click();
  await expect(rec).toHaveAttribute('data-state', 'armed');
  await rec.click();
  await expect(rec).toHaveAttribute('data-state', 'off');
});
