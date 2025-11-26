// ui/tests/a11y-login.spec.ts
import {test,expect} from '@playwright/test';

test('login controls are labeled', async({page})=>{
  await page.goto('/auth/login');
  await expect(page.getByRole('textbox',{name:/email/i})).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByRole('button',{name:/sign in|log in/i})).toBeEnabled();
});
