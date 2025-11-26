// ui/tests/assets.spec.ts
import {test,expect} from '@playwright/test';

const assets=['/noise.png','/sounds/wish_fulfilled.mp3','/ads/hero-parent.jpg'];

for(const a of assets){
  test(`asset reachable: ${a}`, async({request,baseURL})=>{
    const r=await request.get(`${baseURL}${a}`);
    expect([200,206]).toContain(r.status());
  });
}
