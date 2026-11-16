// Smoke-Test der Oberfläche gegen gemocktes Supabase. Aufruf: npm run smoke
// Startet vorher selbst einen Build und `vite preview`.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // vorinstalliert, keine Projekt-Dependency
import { spawn, execSync } from 'node:child_process';
import assert from 'node:assert/strict';

const SB = 'https://example.supabase.co';
const env = { ...process.env, VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: 'anon', VITE_VAPID_PUBLIC_KEY: '' };
execSync('npx vite build', { env, stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', '4317', '--strictPort'], { env, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const user = { id: '00000000-0000-0000-0000-00000000000a', email: 'a@b.de', aud: 'authenticated', role: 'authenticated' };
const session = { access_token: 'tok', refresh_token: 'ref', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user };
const notes = [];
const posts = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
  await page.clock.install({ time: new Date('2026-11-16T09:00:00Z') });
  await page.route(`${SB}/auth/v1/**`, (r) => r.fulfill({ json: user }));
  await page.route(`${SB}/rest/v1/**`, async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (url.pathname.endsWith('/user_settings')) {
      const s = { default_time: '17:00:00', timezone: 'Europe/Berlin' };
      return r.fulfill({ json: single ? s : [s] });
    }
    if (url.pathname.endsWith('/notes')) {
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        posts.push(body);
        const n = { id: 'n' + notes.length, status: 'open', updated_at: new Date().toISOString(), ...body };
        notes.push(n);
        return r.fulfill({ status: 201, json: single ? n : [n] });
      }
      return r.fulfill({ json: notes });
    }
    return r.fulfill({ json: [] });
  });
  await page.addInitScript((s) => localStorage.setItem('sb-example-auth-token', JSON.stringify(s)), session);
  await page.goto('http://localhost:4317/');

  const input = page.locator('#text');
  await input.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'text', 'Eingabefeld fokussiert');
  assert.match(await page.locator('#whenLabel').textContent(), /heute 17:00/);

  await input.fill('Mama anrufen');
  await input.press('Enter');
  await page.getByText('Mama anrufen').waitFor();
  assert.equal(posts[0].remind_at, '2026-11-16T16:00:00.000Z');
  assert.equal(posts[0].custom_time, false);
  assert.equal(await input.inputValue(), '');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'text', 'Fokus bleibt');

  await page.screenshot({ path: process.env.SHOT || 'smoke.png', fullPage: true });
  console.log('SMOKE OK');
} finally {
  await browser.close();
  server.kill();
}
