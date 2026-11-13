import { expect, type Page, test } from '@playwright/test';
import { openDemo } from './helpers';

// v1.1.2 T1, T3: zoom around the pointer with a snap at 100%, and the pan limits.

const camera = (page: Page) => page.evaluate(() => window.__ivandaw?.camera());

/** A ctrl + wheel (what a trackpad pinch sends) at a screen point. Negative deltaY zooms in. */
async function pinch(page: Page, at: { x: number; y: number }, deltaY: number): Promise<void> {
  await page.evaluate(
    ({ x, y, d }) => {
      const el = document.elementFromPoint(x, y) ?? document.querySelector('.ivd-canvas');
      el?.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: d,
          ctrlKey: true,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { x: at.x, y: at.y, d: deltaY },
  );
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox();
  if (!b) throw new Error(`${selector} not on screen`);
  return b;
}

test('ctrl + wheel zooms around the pointer and snaps to 100%', async ({ page }) => {
  await page.goto('/?project=sine');
  const header = '.ivd-node[data-node="n2"] .ivd-header';
  await expect(page.locator(header)).toBeVisible();
  const h = await box(page, header);
  const at = { x: h.x + 20, y: h.y + h.height / 2 };

  // Three notches in: 100% → 200%. The header point under the pointer stays under it.
  for (let i = 0; i < 3; i++) await pinch(page, at, -100);
  expect((await camera(page))?.z).toBeCloseTo(2, 5);
  const h2 = await box(page, header);
  expect(h2.x + 40).toBeCloseTo(at.x, 0); // the pointer was 20 px in from the left edge: now 40
  expect(h2.y + h2.height / 2).toBeCloseTo(at.y, 0);
  await expect(page.locator('.ivd-zoom')).toHaveText('200%');

  // Back out to near 100%: the snap makes it exactly 100%.
  await pinch(page, at, 100);
  await pinch(page, at, 100);
  await pinch(page, at, 60); // raw level 1 → 0.13: inside the snap band
  expect((await camera(page))?.z).toBe(1);
  await expect(page.locator('.ivd-zoom')).toHaveText('100%');

  // Out to about 55%, then the label resets to 100%.
  for (let i = 0; i < 3; i++) await pinch(page, at, 100);
  expect((await camera(page))?.z).toBeLessThan(0.6);
  await page.locator('.ivd-zoom').click();
  expect((await camera(page))?.z).toBe(1);
});

test('at 50%, dragging a node moves it twice as far in the world', async ({ page }) => {
  await page.goto('/?project=sine');
  const header = '.ivd-node[data-node="n2"] .ivd-header';
  await expect(page.locator(header)).toBeVisible();
  const c = await box(page, '.ivd-canvas');
  for (let i = 0; i < 3; i++) await pinch(page, { x: c.x + 400, y: c.y + 200 }, 100);
  expect((await camera(page))?.z).toBeCloseTo(0.5, 5);

  const h = await box(page, header);
  const from = { x: h.x + 30, y: h.y + h.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 50, from.y + 20, { steps: 5 });
  await page.mouse.up();
  const pos = await page.evaluate(() => {
    const n = window.__ivandaw?.project().nodes.find((x) => x.id === 'n2');
    return n && { x: n.x, y: n.y };
  });
  expect(pos).toEqual({ x: 360 + 100, y: 160 + 40 });
});

test('Ctrl + / - / 0 zoom the canvas, not the page', async ({ page }) => {
  await page.goto('/?project=sine');
  await expect(page.locator('.ivd-node[data-node="n1"]')).toBeVisible();
  await page.keyboard.press('Control+Equal');
  expect((await camera(page))?.z).toBeCloseTo(Math.SQRT2, 5);
  await page.keyboard.press('Control+Minus');
  await page.keyboard.press('Control+Minus');
  expect((await camera(page))?.z).toBeCloseTo(Math.SQRT1_2, 5);
  await page.keyboard.press('Control+0');
  expect((await camera(page))?.z).toBe(1);
});

test('panning stops half a screen past the outermost node', async ({ page }) => {
  await openDemo(page);
  const c = await box(page, '.ivd-canvas');
  const mid = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  const edges = () =>
    page.evaluate(() => {
      const rs = [...document.querySelectorAll('.ivd-node')].map((n) => n.getBoundingClientRect());
      return {
        left: Math.min(...rs.map((r) => r.left)),
        right: Math.max(...rs.map((r) => r.right)),
        top: Math.min(...rs.map((r) => r.top)),
        bottom: Math.max(...rs.map((r) => r.bottom)),
      };
    });
  // Scroll on the empty canvas (over a plugin UI the wheel is the plugin's), far more than the
  // scene is wide: it stops with the outermost edge at the middle of the view = half a screen of space.
  const scroll = (dx: number, dy: number) =>
    page.evaluate(
      ({ dx, dy }) => {
        const el = document.querySelector('.ivd-canvas');
        for (let i = 0; i < 10; i++) {
          el?.dispatchEvent(
            new WheelEvent('wheel', { deltaX: dx, deltaY: dy, bubbles: true, cancelable: true }),
          );
        }
      },
      { dx, dy },
    );
  await scroll(1000, 0);
  expect((await edges()).right).toBeCloseTo(mid.x, 0);
  await scroll(-1000, 0);
  expect((await edges()).left).toBeCloseTo(mid.x, 0);
  await scroll(0, 1000);
  expect((await edges()).bottom).toBeCloseTo(mid.y, 0);
  await scroll(0, -1000);
  expect((await edges()).top).toBeCloseTo(mid.y, 0);
});
