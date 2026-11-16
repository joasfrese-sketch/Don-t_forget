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
const settingsWrites = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
  await page.clock.install({ time: new Date('2026-11-16T09:00:00Z') });
  const authPuts = [];
  await page.route(`${SB}/auth/v1/**`, (r) => {
    const req = r.request();
    if (req.method() === 'PUT' && req.url().endsWith('/auth/v1/user')) authPuts.push(req.postDataJSON());
    return r.fulfill({ json: user });
  });
  await page.route(`${SB}/rest/v1/**`, async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    if (url.pathname.endsWith('/user_settings')) {
      const s = { default_time: '17:00:00', timezone: 'Europe/Berlin' };
      if (req.method() !== 'GET') { settingsWrites.push(req.postDataJSON()); return r.fulfill({ status: 201, json: single ? s : [s] }); }
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

  // --- Einstellungen: Darstellung und Konto ---
  await page.locator('#openSettings').click();
  await page.locator('#themeDark').click();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'Dunkel gesetzt');
  await page.reload();
  await page.locator('#text').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true, 'Dunkel bleibt nach Neuladen');
  await page.locator('#themeLight').waitFor(); // Adresse #/einstellungen öffnet den Dialog nach dem Neuladen wieder
  await page.locator('#themeLight').click();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false, 'Hell gesetzt');
  assert.equal((await page.locator('#accountEmail').textContent()).trim(), 'a@b.de');
  await page.locator('#newPw').fill('123');
  await page.locator('#changePw').click();
  await page.getByText('Mindestens 6 Zeichen.').first().waitFor();
  assert.equal(authPuts.length, 0, 'kurzes Passwort wird nicht gesendet');
  await page.locator('#newPw').fill('geheim123');
  await page.locator('#changePw').click();
  await page.getByText('Passwort geändert').waitFor();
  assert.deepEqual(authPuts.map((b) => b.password), ['geheim123']);
  // --- Nachfassen ---
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (fn()) return; await page.waitForTimeout(50); } throw new Error('Zeitüberschreitung: ' + what); };
  const setField = async (sel, v) => { const l = page.locator(sel); await l.fill(v); await l.evaluate((el) => el.blur()); }; // blur löst change aus
  await page.locator('#followupToggle').click();
  await setField('#fuHours', '3');
  await until(() => settingsWrites.some((w) => w.followup_hours === 3), 'followup_hours 3 gespeichert');
  const before = settingsWrites.length;
  await setField('#fuHours', '0');
  await page.getByText('Stunden: 1 bis 24.').waitFor();
  assert.equal(settingsWrites.length, before, 'ungültiger Wert wird nicht gespeichert');
  assert.equal(await page.locator('#fuHours').inputValue(), '3', 'Eingabe springt auf den letzten gültigen Wert zurück');
  await setField('#evening', '07:00');
  await page.getByText('Abend muss nach dem Morgen liegen.').waitFor();
  assert.equal(settingsWrites.length, before, 'Abend vor Morgen wird nicht gespeichert');
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/followup.png` });
  await page.locator('#fuEnabled').uncheck();
  await until(() => settingsWrites.some((w) => w.followup_enabled === false), 'followup_enabled aus gespeichert');
  assert.equal(await page.locator('#fuHours').isDisabled(), true, 'Felder sind bei „aus“ gesperrt');

  if (process.env.SHOT_DIR) {
    for (const scheme of ['light', 'dark']) {
      await page.locator(scheme === 'dark' ? '#themeDark' : '#themeLight').click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${process.env.SHOT_DIR}/settings-${scheme}.png` });
    }
    await page.locator('#themeSystem').click();
  }
  await page.locator('#sClose').click();

  if (process.env.SHOT_DIR) {
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${process.env.SHOT_DIR}/main-${scheme}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  // --- Anmeldung mit E-Mail und Passwort (ohne gespeicherte Sitzung) ---
  const login = await browser.newPage({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
  let tokenBody = null;
  await login.route(`${SB}/auth/v1/**`, (r) => {
    const url = r.request().url();
    if (url.includes('/token?grant_type=password')) {
      tokenBody = r.request().postDataJSON();
      if (tokenBody.password !== 'geheim123') return r.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' } });
      return r.fulfill({ json: session });
    }
    return r.fulfill({ json: user });
  });
  await login.route(`${SB}/rest/v1/**`, (r) => {
    const single = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    const s = { default_time: '17:00:00', timezone: 'Europe/Berlin' };
    return r.fulfill({ json: r.request().url().includes('user_settings') ? (single ? s : [s]) : [] });
  });
  await login.goto('http://localhost:4317/');
  await login.locator('#email').fill('a@b.de');
  await login.locator('#password').fill('falsch');
  await login.locator('#signIn').click();
  await login.getByText('E-Mail oder Passwort falsch').waitFor();
  await login.locator('#password').fill('geheim123');
  await login.locator('#signIn').click();
  await login.locator('#text').waitFor();
  assert.equal(tokenBody.email, 'a@b.de');
  await login.close();

  // --- Konto erstellen: Bestätigungs-Mail-Hinweis ---
  const reg = await browser.newPage({ locale: 'de-DE' });
  let signupBody = null;
  await reg.route(`${SB}/auth/v1/**`, (r) => {
    if (r.request().url().includes('/signup')) {
      signupBody = r.request().postDataJSON();
      return r.fulfill({ json: { ...user, identities: [{}], confirmation_sent_at: new Date().toISOString() } });
    }
    return r.fulfill({ json: {} });
  });
  await reg.goto('http://localhost:4317/');
  await reg.locator('#email').fill('neu@b.de');
  await reg.locator('#password').fill('geheim123');
  await reg.locator('#signupBtn').click();
  await reg.getByText('Bestätigungs-Mail').waitFor();
  assert.equal(signupBody.email, 'neu@b.de');
  await reg.close();

  console.log('SMOKE OK');
} finally {
  await browser.close();
  server.kill();
}
