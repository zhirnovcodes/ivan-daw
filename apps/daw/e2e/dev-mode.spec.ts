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
    for (const kind of ['', '&mobile=1'])
      await request.delete(`/__presets/preset?name=${encodeURIComponent(n)}${kind}`);
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

  // Load opens it in place of the open project, and puts ?preset= in the address.
  await page.getByRole('textbox', { name: 'BPM' }).fill('90');
  await page.getByRole('textbox', { name: 'BPM' }).press('Enter');
  await panel.getByRole('button', { name: 'Load' }).click();
  await expect(status).toHaveText(`Loaded "${NAME}"`);
  const loaded = await page.evaluate(() => window.__ivandaw?.project());
  expect(loaded?.transport.bpm).toBe(133);
  expect(new URL(page.url()).searchParams.get('preset')).toBe(NAME);
  await expect.poll(() => page.evaluate(() => window.__ivandaw?.status().n2)).toBe('ready');

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

// 2026-11-26: a preset is a name plus a Mobile flag, and it keeps the zoom and scroll.
test('mobile and desktop presets of one name, each with its own view', async ({
  page,
  request,
}) => {
  await openDemo(page, '/?project=sine&mode=dev');
  const panel = page.locator('.ivp-presets');
  const status = panel.getByRole('status');
  const bpm = page.getByRole('textbox', { name: 'BPM' });
  const cam = () => page.evaluate(() => window.__ivandaw?.camera());
  const bpmNow = async () =>
    (await page.evaluate(() => window.__ivandaw?.project()))?.transport.bpm;

  // Desktop: zoomed in once, 111 BPM.
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await bpm.fill('111');
  await bpm.press('Enter');
  const desktopView = await cam();
  await panel.getByRole('textbox', { name: 'Preset name' }).fill(NAME);
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(status).toHaveText(`Saved "${NAME}"`);

  // Mobile: zoomed out, 142 BPM; the same name with Mobile ticked is a second preset.
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await bpm.fill('142');
  await bpm.press('Enter');
  const mobileView = await cam();
  expect(mobileView?.z).not.toBe(desktopView?.z);
  await panel.getByRole('checkbox', { name: 'Mobile' }).check();
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(status).toHaveText(`Saved "${NAME} MOBILE"`);
  await expect(panel.getByRole('option', { name: NAME, exact: true })).toHaveCount(1);
  await expect(panel.getByRole('option', { name: `${NAME} MOBILE`, exact: true })).toHaveCount(1);

  // Clicking a list item sets the name and the toggle.
  await panel.getByRole('option', { name: NAME, exact: true }).click();
  await expect(panel.getByRole('checkbox', { name: 'Mobile' })).not.toBeChecked();

  // Each version opens its own kind, at its saved view.
  await openDemo(page, `/?preset=${encodeURIComponent(NAME)}&mode=dev`);
  expect(await bpmNow()).toBe(111);
  expect(await cam()).toEqual(desktopView);
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemo(page, `/?preset=${encodeURIComponent(NAME)}&mobile=true`);
  expect(await bpmNow()).toBe(142);
  expect(await cam()).toEqual(mobileView);

  // Dev mode works on the mobile version too: the preset panel is there, Mobile starts ticked.
  await openDemo(page, `/?preset=${encodeURIComponent(NAME)}&mode=dev&mobile=true`);
  expect(await page.evaluate(() => window.__ivandaw?.mode())).toBe('dev');
  expect(await page.evaluate(() => window.__ivandaw?.mobile())).toBe(true);
  await expect(page.locator('html')).toHaveClass(/ivd-mobile/);
  await expect(panel.getByRole('checkbox', { name: 'Mobile' })).toBeChecked();
  expect(await bpmNow()).toBe(142);

  // With no mobile preset of that name, the mobile version opens the desktop one.
  await request.delete(`/__presets/preset?name=${encodeURIComponent(NAME)}&mobile=1`);
  await openDemo(page, `/?preset=${encodeURIComponent(NAME)}&mobile=true`);
  expect(await bpmNow()).toBe(111);
  await expect(page.locator('.ivd-toast')).toHaveCount(0);
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
