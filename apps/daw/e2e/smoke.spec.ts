import { expect, test } from '@playwright/test';

// P1 smoke test: the dev server serves the app shell. P10 adds the real app test.
test('the dev server serves the app', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('IvanDAW');
  await expect(page.locator('#app')).toHaveText('IvanDAW');
});
