import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

// Development mode (2026-11-23): ?mode=dev is normal mode plus the preset panel.
// The spec writes into apps/daw/public/presets through the dev server, and removes its presets after.
// Names are unique per run, so parallel and repeated runs don't touch each other's presets.
let NAME = '';
let BEAT = '';

test.beforeEach(({ page: _ }, info) => {
  const run = `${info.workerIndex} ${info.repeatEachIndex} ${info.retry}`;
  NAME = `E2E Preset ${run}`;
  BEAT = `E2E Beatality ${run}`;
});

test.afterEach(async ({ request }) => {
  for (const n of [NAME, BEAT])
    await request.delete(`/__presets/preset?name=${encodeURIComponent(n)}`);
});

test('dev mode saves, lists, replaces, opens and deletes a preset', async ({ page }) => {
  await openDemo(page, '/?project=sine&mode=dev');
  expect(await page.evaluate(() => window.__ivandaw?.mode())).toBe('dev');
  await expect(page.locator('.ivd-play-tag')).toHaveText('Development');
  await expect(page.getByRole('button', { name: 'Add plugin' })).toBeEnabled();

  const panel = page.locator('.ivp-presets');
  const name = panel.getByRole('textbox', { name: 'Preset name' });
  const status = panel.getByRole('status');
  const item = panel.getByRole('option', { name: NAME, exact: true });

  // Save a new preset at 133 BPM.
  await page.getByRole('textbox', { name: 'BPM' }).fill('133');
  await page.getByRole('textbox', { name: 'BPM' }).press('Enter');
  await name.fill(NAME);
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(status).toHaveText(`Saved "${NAME}"`);
  await expect(item).toBeVisible();

  // Clicking the list item puts its name in the field; saving again replaces it.
  await name.fill('');
  await item.click();
  await expect(name).toHaveValue(NAME);
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(status).toHaveText(`Replaced "${NAME}"`);
  await expect(panel.getByRole('option', { name: NAME, exact: true })).toHaveCount(1);

  // ?preset= opens it, with each plugin's own state.
  await openDemo(page, `/?preset=${encodeURIComponent(NAME)}&mode=dev`);
  const p = await page.evaluate(() => window.__ivandaw?.project());
  expect(p?.transport.bpm).toBe(133);
  expect(p?.nodes.find((n) => n.id === 'n2')?.state?.pluginId).toBe('com.ivandaw.base-sine-synth');

  // Delete asks first: No keeps it, Yes removes it.
  await item.click();
  await panel.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete preset' });
  await expect(dialog).toContainText(`Delete preset "${NAME}"?`);
  await dialog.getByRole('button', { name: 'No' }).click();
  await expect(item).toBeVisible();
  await panel.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Yes' }).click();
  await expect(status).toHaveText(`Deleted "${NAME}"`);
  await expect(item).toHaveCount(0);
});

test('no preset panel outside dev mode', async ({ page }) => {
  await openDemo(page, '/?project=sine');
  await expect(page.locator('.ivp-presets')).toHaveCount(0);
  await openDemo(page, '/?project=sine&mode=play_only');
  expect(await page.evaluate(() => window.__ivandaw?.mode())).toBe('play');
  await expect(page.locator('.ivp-presets')).toHaveCount(0);
});

// Beatality samples come from its own library (the pinned release's packs/samples), never from disk:
// a saved preset names them, and each name must be served by the plugin.
test('a saved preset with Beatality points only at samples its release serves', async ({
  page,
  request,
}) => {
  await openDemo(page, '/?mode=dev');
  const panel = page.locator('.ivp-presets');
  await panel.getByRole('textbox', { name: 'Preset name' }).fill(BEAT);
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('status')).toHaveText(`Saved "${BEAT}"`);

  await openDemo(page, `/?preset=${encodeURIComponent(BEAT)}&mode=dev`);
  const node = (await page.evaluate(() => window.__ivandaw?.project()))?.nodes.find(
    (n) => n.plugin === 'com.beatality.beatality',
  );
  const data = node?.state?.data as { tracks?: { source: { type: string; id: string } }[] };
  const tracks = data?.tracks ?? [];
  expect(tracks.length).toBeGreaterThan(0);
  expect(node?.state?.files).toBeUndefined();
  for (const t of tracks) {
    expect(t.source.type).toBe('internal');
    const res = await request.get(
      `/plugins/com.beatality.beatality/packs/samples/${encodeURIComponent(t.source.id)}`,
    );
    expect(res.ok(), t.source.id).toBe(true);
  }
  expect(await page.evaluate((id) => window.__ivandaw?.status()[id], node?.id ?? '')).toBe('ready');
  await expect(page.locator('.ivd-toast')).toHaveCount(0);
});

test('?preset= with a name that is not saved says so and opens the project', async ({ page }) => {
  await openDemo(page, '/?preset=No%20Such%20Preset&project=sine');
  await expect(page.locator('.ivd-toast')).toContainText('No saved preset "No Such Preset"');
  const nodes = (await page.evaluate(() => window.__ivandaw?.project()))?.nodes.map(
    (n) => n.plugin,
  );
  expect(nodes).toContain('com.ivandaw.base-sine-synth');
});
