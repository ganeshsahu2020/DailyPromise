import {test, expect} from '@playwright/test';
import {uiLogin, hasTestCreds} from './_helpers/auth';

test.skip(!hasTestCreds, 'No test creds configured');

test('reports page has no width/height -1 warnings', async({page})=>{
  const logs:string[]=[];
  page.on('console',msg=>{
    const t=msg.type(); const tx=msg.text();
    if(t==='warning' || t==='error') logs.push(tx);
  });
  await uiLogin(page);
  await page.goto('/child/reports');
  await page.waitForTimeout(300);
  const offenders = logs.filter(l=>/width\(-?1\)|height\(-?1\)|minWidth|minHeight/.test(l));
  expect(offenders).toEqual([]);
});
