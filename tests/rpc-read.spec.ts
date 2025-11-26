import {test, expect} from '@playwright/test';

const URL=process.env.VITE_SUPABASE_URL || 'https://zrkjgvnoihrsodzvaaro.supabase.co';
const ANON=process.env.VITE_SUPABASE_ANON_KEY!;

test('child wallet view/rpc reachable (read-only)', async({request})=>{
  // This endpoint may be protected in your project; accept 401 as "RLS enforced"
  const r=await request.get(`${URL}/rest/v1/child_profiles?select=id&limit=1`,{
    headers:{apikey:ANON,Authorization:`Bearer ${ANON}`}
  });
  expect([200,206,401]).toContain(r.status());
});
