import {test, expect} from '@playwright/test';
import {uiLogin, hasTestCreds} from './_helpers/auth';

test.skip(!hasTestCreds, 'No test creds configured');

test('games page mounts, no network 4xx/5xx on load', async({page})=>{
  const bad:number[]=[];
  page.on('requestfinished',async req=>{
    try{
      const res=await req.response();
      if(!res) return;
      const s=res.status();
      if(s>=400) bad.push(s);
    }catch{}
  });
  await uiLogin(page);
  await page.goto('/child/games');
  await expect(page.locator('main, #main')).toBeVisible();
  await page.waitForTimeout(500);
  expect(bad).toEqual([]);
});
