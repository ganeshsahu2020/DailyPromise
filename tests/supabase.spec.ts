import {test,expect} from '@playwright/test';

const URL=process.env.VITE_SUPABASE_URL || 'https://zrkjgvnoihrsodzvaaro.supabase.co';
const ANON=process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpya2pndm5vaWhyc29kenZhYXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4MzM2NjEsImV4cCI6MjA3NzQwOTY2MX0.PmIWWbAzsdNSgDOJ5snMv0LjNUYob6cPyBFc8_Oikr8';

test('supabase auth settings reachable', async({request})=>{
  const r=await request.get(`${URL}/auth/v1/settings`,{
    headers:{apikey:ANON,Authorization:`Bearer ${ANON}`}
  });
  expect(r.status()).toBe(200);
});
