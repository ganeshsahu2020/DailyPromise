// ui/tests/routes.spec.ts
import {test,expect} from '@playwright/test';
const paths=['/','/auth/login','/child','/child/wishlist','/child/reports','/child/games'];

for(const p of paths){
  test(`route ok: ${p}`, async({page})=>{
    await page.goto(p);
    // page should render something meaningful; not a 404 shell
    await expect(page).not.toHaveTitle(/404|not found/i);
  });
}
