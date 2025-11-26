import {test, expect} from '@playwright/test';
import {uiLogin, hasTestCreds} from './_helpers/auth';

test.describe('authenticated routes', ()=>{
  test.skip(!hasTestCreds, 'No test creds configured');

  test('child dashboard loads post-login', async({page})=>{
    await uiLogin(page);
    await page.goto('/child');
    await expect(page).toHaveURL(/\/child/);
    await expect(page.locator('main, #main, [data-testid="main"]')).toBeVisible();
  });

  test('wishlist renders list empty-or-not without crashing', async({page})=>{
    await uiLogin(page);
    await page.goto('/child/wishlist');
    await expect(page).toHaveURL(/wishlist/);
    await expect(page.locator('[data-testid="wishlist-list"], table, [role="table"], [data-testid="wishlist-grid"]')).toBeVisible();
  });

  test('reports page shows charts container', async({page})=>{
    await uiLogin(page);
    await page.goto('/child/reports');
    await expect(page.locator('[data-testid="reports-charts"], .recharts-wrapper, canvas')).toBeVisible();
  });
});
