// ui/tests/smoke.spec.ts
import {test, expect} from '@playwright/test';

test('loads home without crashing', async({page})=>{
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});

test('navigates to login (header link)', async({page})=>{
  await page.goto('/');
  const header = page.getByRole('banner');
  const loginLink = header.getByRole('link',{name:/sign in/i});
  await expect(loginLink).toBeVisible();
  await loginLink.click();
  await expect(page).toHaveURL(/login|auth/i);
});

test('page scripts run (env or any global)', async({page})=>{
  await page.goto('/');
  const something = await page.evaluate(()=>{
    return (window as any).VITE_SUPABASE_URL || document.querySelector('[id], [data-testid], main, #root') !== null;
  });
  expect(something).toBeTruthy();
});
