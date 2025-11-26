import {test,expect} from '@playwright/test';

test('child route requires auth (redirects to login)', async({page})=>{
  await page.goto('/child');
  await expect(page).toHaveURL(/auth|login/i);
});
