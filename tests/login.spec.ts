import {test,expect} from '@playwright/test';

test('login form renders & is interactive', async({page})=>{
  await page.goto('/auth/login');
  const email=page.getByRole('textbox',{name:/email/i});
  const pass=page.getByLabel(/password/i);
  const submit=page.getByRole('button',{name:/sign in|log in/i});
  await expect(email).toBeVisible();
  await expect(pass).toBeVisible();
  await expect(submit).toBeEnabled();
});
