import { expect, type Page } from '@playwright/test';

/** Opens the app and waits until the demo project is loaded and every node in it is ready. */
export async function openDemo(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const h = window.__ivandaw;
          if (!h) return false;
          const nodes = h.project().nodes;
          return nodes.length > 1 && nodes.every((n) => h.status()[n.id] === 'ready');
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
}

/** Adds a plugin from `+ Add` and waits for it to be ready. Returns the new node id. */
export async function addNode(page: Page, name: RegExp): Promise<string> {
  const before = await page.evaluate(
    () => window.__ivandaw?.project().nodes.map((n) => n.id) ?? [],
  );
  await page.getByRole('button', { name: '+ Add' }).click();
  await page.getByRole('menuitem', { name }).click();
  let id: string | undefined;
  await expect
    .poll(async () => {
      id = await page.evaluate(
        (prev) => window.__ivandaw?.project().nodes.find((n) => !prev.includes(n.id))?.id,
        before,
      );
      return id;
    })
    .toBeTruthy();
  await expect
    .poll(() => page.evaluate((nid) => window.__ivandaw?.status()[nid as string], id), {
      timeout: 20_000,
    })
    .toBe('ready');
  return id as string;
}

/** The dot of a port, for dragging cables. */
export const portDot = (node: string, port: string, dir: 'in' | 'out') =>
  `.ivd-node[data-node="${node}"] .ivd-port.${dir}[data-port="${port}"] i`;

/** Drags the mouse from one element's centre to another's, as a user drawing a cable. */
export async function drag(page: Page, from: string, to: string): Promise<void> {
  const a = await page.locator(from).boundingBox();
  const b = await page.locator(to).boundingBox();
  if (!a || !b) throw new Error('port not on screen');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

export const rms = (page: Page) => page.evaluate(() => window.__ivandaw?.rms() ?? 0);
