// ui/tests/_helpers/auth.ts
import {Page, expect, test} from '@playwright/test';

export const hasTestCreds =
  Boolean(process.env.VITE_TEST_EMAIL) && Boolean(process.env.VITE_TEST_PASSWORD);

export async function uiLogin(page:Page, email?:string, password?:string){
  const e = email ?? process.env.VITE_TEST_EMAIL;
  const p = password ?? process.env.VITE_TEST_PASSWORD;
  test.skip(!e || !p, 'Set VITE_TEST_EMAIL and VITE_TEST_PASSWORD in ui/.env.test.local');
  await page.goto('/auth/login');
  await page.getByRole('textbox',{name:/email/i}).fill(e!);
  await page.getByLabel(/password/i).fill(p!);
  await page.getByRole('button',{name:/sign in|log in/i}).click();
  await page.waitForURL(/child|dashboard|landing/i, {timeout: 10000});
  await expect(page.getByRole('navigation')).toBeVisible();
}
