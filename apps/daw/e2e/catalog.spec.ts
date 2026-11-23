import { expect, test } from '@playwright/test';
import { serveProject, settled } from './fixtures';
import { rms } from './helpers';

// E3: every plugin in /plugins/catalog.json loads in an empty scene; instruments sound.
// Catches a broken release as soon as its pin moves and `pnpm check` runs.
// Instruments get their note from Note hold (one held note from Play to Stop): the test hook (C7)
// has no call to send a note.

interface Entry {
  id: string;
  name: string;
  kind: string;
  ports: { id: string; kind: string; direction: string; accepts?: string[] }[];
}

const NOTE_HOLD = 'com.ivandaw.note-hold';

test('every catalog plugin loads, sounds if it is an instrument, and removes cleanly', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('console', (m) => {
    // TensorFlow Lite (MusicHands' hand tracking) prints its "INFO: …" start-up lines as errors.
    if (m.type() === 'error' && !m.text().startsWith('INFO: ')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await serveProject(page, 'e2e-catalog-empty', [], []);
  await page.goto('/?project=e2e-catalog-empty');
  const catalog = await page.evaluate(
    async () => (await (await fetch('/plugins/catalog.json')).json()) as { plugins: Entry[] },
  );
  expect(catalog.plugins.length).toBeGreaterThan(0);
  expect(catalog.plugins.map((p) => p.id)).toContain(NOTE_HOLD);

  for (const [i, entry] of catalog.plugins.entries()) {
    await test.step(`${entry.name} (${entry.id})`, async () => {
      const notesIn = entry.ports.find(
        (p) => p.kind === 'events' && p.direction === 'in' && p.accepts?.includes('midi'),
      );
      const audioOut = entry.ports.find((p) => p.kind === 'audio' && p.direction === 'out');
      const instrument = entry.kind === 'instrument' && notesIn && audioOut;

      const name = `e2e-catalog-${i}`;
      if (instrument) {
        await serveProject(
          page,
          name,
          [
            { id: 'hold', plugin: NOTE_HOLD },
            { id: 'p', plugin: entry.id },
          ],
          [
            ['hold', 'out', 'p', notesIn.id],
            ['p', audioOut.id, 'master', 'in'],
          ],
        );
      } else {
        await serveProject(page, name, [{ id: 'p', plugin: entry.id }], []);
      }
      errors.length = 0;
      await page.goto(`/?project=${name}`);
      expect((await settled(page)).p, `${entry.id} status`).toBe('ready');

      if (instrument) {
        await page.evaluate(() => window.__ivandaw?.play());
        await expect.poll(() => rms(page), { timeout: 5_000 }).toBeGreaterThan(0.01);
        await page.evaluate(() => window.__ivandaw?.stop());
        // An instrument may ring out for the tail it declares (Axolotl Pad: 12 s), not forever.
        await expect.poll(() => rms(page), { timeout: 13_000 }).toBeLessThan(0.001);
      }

      await page.locator('.ivd-node[data-node="p"] .ivd-header').click();
      await page.keyboard.press('Delete');
      await expect
        .poll(() =>
          page.evaluate(() => window.__ivandaw?.project().nodes.some((n) => n.id === 'p')),
        )
        .toBe(false);
      // Let the 20 ms fade-out and dispose run before checking the console.
      await page.waitForTimeout(200);
      expect(errors, `${entry.id} console errors`).toEqual([]);
    });
  }
});
