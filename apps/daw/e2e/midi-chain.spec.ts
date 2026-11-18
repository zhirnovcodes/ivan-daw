import { expect, test } from '@playwright/test';
import { installFixturePlugins, serveProject, settled, TRANSPOSE } from './fixtures';
import { rms } from './helpers';

// E1: a MIDI → MIDI plugin between a note source and an instrument.
// Note hold → transpose (+12, test fixture) → sine synth → Master.
const NODES = [
  { id: 'hold', plugin: 'com.ivandaw.note-hold' },
  { id: 'tr', plugin: TRANSPOSE },
  { id: 'sine', plugin: 'com.ivandaw.base-sine-synth' },
];

test('a MIDI → MIDI chain plays on Play and is silent after Stop', async ({ page }) => {
  await installFixturePlugins(page);
  await serveProject(page, 'e2e-midi-chain', NODES, [
    ['hold', 'out', 'tr', 'in'],
    ['tr', 'out', 'sine', 'in'],
    ['sine', 'out', 'master', 'in'],
  ]);
  await page.goto('/?project=e2e-midi-chain');
  expect(await settled(page)).toEqual({
    hold: 'ready',
    tr: 'ready',
    sine: 'ready',
    master: 'ready',
  });

  await page.evaluate(() => window.__ivandaw?.play());
  await expect.poll(() => rms(page), { timeout: 5_000 }).toBeGreaterThan(0.01);
  await page.evaluate(() => window.__ivandaw?.stop());
  await expect.poll(() => rms(page), { timeout: 2_000 }).toBeLessThan(0.001);
});

test('with the chain broken after the MIDI → MIDI plugin, the synth stays silent', async ({
  page,
}) => {
  // Guards the test above: the sound must come through the fixture, not around it.
  await installFixturePlugins(page);
  await serveProject(page, 'e2e-midi-chain-open', NODES, [
    ['hold', 'out', 'tr', 'in'],
    ['sine', 'out', 'master', 'in'],
  ]);
  await page.goto('/?project=e2e-midi-chain-open');
  await settled(page);
  await page.evaluate(() => window.__ivandaw?.play());
  await page.waitForTimeout(500);
  expect(await rms(page)).toBeLessThan(0.001);
  await page.evaluate(() => window.__ivandaw?.stop());
});
