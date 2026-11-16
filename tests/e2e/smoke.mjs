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

  const until2 = async (fn, pg) => { for (let i = 0; i < 100; i++) { if (fn()) return; await pg.waitForTimeout(50); } throw new Error('Zeitüberschreitung'); };
  // --- Sprechen und ✨ (KI) ---
  const SPEECH = {
    none: `Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
           Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });`,
    ok: `window.SpeechRecognition = window.webkitSpeechRecognition = class {
           start() { Promise.resolve().then(() => { this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'morgen Zahnarzt anrufen' }], { isFinal: true })] }); this.onend && this.onend(); }); }
           stop() {}
         };`,
    throws: `window.__starts = 0;
         window.SpeechRecognition = window.webkitSpeechRecognition = class {
           start() { window.__starts++; throw new Error('nicht nutzbar'); }
           stop() {}
         };`,
    denied: `window.SpeechRecognition = window.webkitSpeechRecognition = class {
           start() { Promise.resolve().then(() => { this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); }); }
           stop() {}
         };`,
  };
  async function appPage({ speech, parse, oldSchema = false }) {
    const pg = await browser.newPage({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
    await pg.clock.install({ time: new Date('2026-11-16T09:00:00Z') });
    const st = { posts: [], parseBodies: [] };
    await pg.route(`${SB}/auth/v1/**`, (r) => r.fulfill({ json: user }));
    await pg.route(`${SB}/rest/v1/**`, (r) => {
      const req = r.request();
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (req.url().includes('/user_settings')) {
        // Alte Datenbank ohne Nachfass-Spalten: ausdrücklich danach zu fragen schlägt fehl (wie bei Supabase)
        if (oldSchema && decodeURIComponent(req.url()).includes('followup_')) {
          return r.fulfill({ status: 400, json: { code: '42703', details: null, hint: null, message: 'column user_settings.followup_enabled does not exist' } });
        }
        const cfg = { default_time: '17:00:00', timezone: 'Europe/Berlin' };
        return r.fulfill({ status: req.method() === 'GET' ? 200 : 201, json: single ? cfg : [cfg] });
      }
      if (req.method() === 'POST') {
        const body = req.postDataJSON();
        st.posts.push(body);
        const n = { id: 'v' + st.posts.length, status: 'open', updated_at: new Date().toISOString(), ...body };
        return r.fulfill({ status: 201, json: single ? n : [n] });
      }
      return r.fulfill({ json: [] });
    });
    await pg.route(`${SB}/functions/v1/parse-note`, (r) => {
      st.parseBodies.push(r.request().postDataJSON());
      const res = parse();
      return r.fulfill({ status: res.status ?? 200, json: res.json });
    });
    await pg.addInitScript((sess) => localStorage.setItem('sb-example-auth-token', JSON.stringify(sess)), session);
    await pg.addInitScript(SPEECH[speech]);
    await pg.goto('http://localhost:4317/');
    await pg.locator('#text').waitFor();
    return { pg, st };
  }
  const TWO = { json: { notes: [{ text: 'Reifen wechseln', date: '2026-11-20', time: '09:00' }, { text: 'Zahnarzt anrufen', date: null, time: null }] } };

  { // ohne Spracherkennung: kein Mikrofon, ✨ nur mit Text; Vorschau, Entfernen, Speichern
    const { pg, st } = await appPage({ speech: 'none', parse: () => TWO });
    assert.equal(await pg.locator('#micBtn').count(), 0, 'kein Mikrofon ohne Spracherkennung');
    assert.equal(await pg.locator('#aiBtn').isDisabled(), true, '✨ bei leerem Feld gesperrt');
    await pg.locator('#text').fill('Reifen am Freitag um 9 und Zahnarzt anrufen');
    assert.equal(await pg.locator('#aiBtn').isDisabled(), false, '✨ mit Text aktiv');
    await pg.locator('#aiBtn').click();
    await pg.locator('#previewSave').waitFor();
    assert.equal(st.parseBodies[0].text, 'Reifen am Freitag um 9 und Zahnarzt anrufen');
    assert.equal(st.parseBodies[0].timezone, 'Europe/Berlin');
    assert.equal(await pg.locator('[data-row]').count(), 2);
    await pg.getByText('Fr 20.11. 09:00').waitFor();
    await pg.getByText('heute 17:00').first().waitFor();
    if (process.env.SHOT_DIR) {
      await pg.screenshot({ path: `${process.env.SHOT_DIR}/preview-light.png` });
      await pg.emulateMedia({ colorScheme: 'dark' });
      await pg.waitForTimeout(400);
      await pg.screenshot({ path: `${process.env.SHOT_DIR}/preview-dark.png` });
      await pg.emulateMedia({ colorScheme: 'light' });
    }
    await pg.locator('#previewSave').click();
    await until2(() => st.posts.length === 2, pg);
    assert.deepEqual(st.posts.map((b) => [b.text, b.remind_at, b.custom_time]), [
      ['Reifen wechseln', '2026-11-20T08:00:00.000Z', true],
      ['Zahnarzt anrufen', '2026-11-16T16:00:00.000Z', false],
    ]);
    assert.equal(await pg.locator('#text').inputValue(), '', 'Feld nach dem Speichern leer');
    await pg.close();
  }
  { // Neue App, noch nicht aktualisierte Datenbank: die App muss trotzdem laden (Vorgaben für Nachfassen)
    const { pg } = await appPage({ speech: 'none', parse: () => TWO, oldSchema: true });
    await pg.locator('#openSettings').click();
    await pg.locator('#followupToggle').click();
    assert.equal(await pg.locator('#fuHours').inputValue(), '5', 'Vorgabe 5 Stunden');
    assert.equal(await pg.locator('#evening').inputValue(), '18:00');
    assert.equal(await pg.locator('#morning').inputValue(), '08:00');
    await pg.close();
  }
  { // Eintrag in der Vorschau entfernen und Text ändern
    const { pg, st } = await appPage({ speech: 'none', parse: () => TWO });
    await pg.locator('#text').fill('zwei Dinge');
    await pg.locator('#aiBtn').click();
    await pg.locator('#previewSave').waitFor();
    await pg.locator('[data-remove="0"]').click();
    assert.equal(await pg.locator('[data-row]').count(), 1);
    await pg.locator('[data-field="text"]').fill('Zahnarzt Dr. Weber anrufen');
    await pg.locator('#previewSave').click();
    await until2(() => st.posts.length === 1, pg);
    assert.equal(st.posts[0].text, 'Zahnarzt Dr. Weber anrufen');
    await pg.close();
  }
  { // Abbrechen: nichts gespeichert, Text bleibt
    const { pg, st } = await appPage({ speech: 'none', parse: () => TWO });
    await pg.locator('#text').fill('doch nicht');
    await pg.locator('#aiBtn').click();
    await pg.locator('#previewCancel').click();
    assert.equal(st.posts.length, 0);
    assert.equal(await pg.locator('#text').inputValue(), 'doch nicht');
    await pg.close();
  }
  { // KI nicht eingerichtet
    const { pg, st } = await appPage({ speech: 'none', parse: () => ({ status: 503, json: { error: 'not_configured' } }) });
    await pg.locator('#text').fill('Zahnarzt anrufen');
    await pg.locator('#aiBtn').click();
    await pg.getByText('Claude ist noch nicht eingerichtet.').waitFor();
    assert.equal(st.posts.length, 0);
    assert.equal(await pg.locator('#text').inputValue(), 'Zahnarzt anrufen', 'Text bleibt im Feld');
    await pg.close();
  }
  { // Claude findet keinen Termin
    const { pg } = await appPage({ speech: 'none', parse: () => ({ json: { notes: [] } }) });
    await pg.locator('#text').fill('hm');
    await pg.locator('#aiBtn').click();
    await pg.getByText('Daraus konnte ich keinen Termin machen. Bitte tippen.').waitFor();
    assert.equal(await pg.locator('#text').inputValue(), 'hm');
    await pg.close();
  }
  { // Mikrofon vorhanden: Text erscheint im Feld, Anfrage geht an Claude, Vorschau
    const { pg, st } = await appPage({ speech: 'ok', parse: () => ({ json: { notes: [{ text: 'Zahnarzt anrufen', date: '2026-11-17', time: null }] } }) });
    await pg.locator('#micBtn').waitFor();
    await pg.locator('#micBtn').click();
    await pg.locator('#previewSave').waitFor();
    assert.equal(st.parseBodies[0].text, 'morgen Zahnarzt anrufen');
    assert.equal(await pg.locator('#text').inputValue(), 'morgen Zahnarzt anrufen');
    await pg.getByText('morgen 17:00').first().waitFor();
    await pg.close();
  }
  { // start() wirft (z. B. iPad-App): Meldung, Knopf nicht hängend, erneutes Tippen versucht es wieder
    const { pg, st } = await appPage({ speech: 'throws', parse: () => TWO });
    await pg.locator('#micBtn').click();
    await pg.getByText('Spracherkennung hat nicht geklappt.').waitFor();
    assert.equal(await pg.locator('#micBtn').getAttribute('aria-pressed'), 'false', 'Mikrofon bleibt nicht „gedrückt“');
    await pg.locator('#micBtn').click();
    await until2(() => true, pg);
    assert.equal(await pg.evaluate(() => window.__starts), 2, 'zweiter Tipp startet erneut (nicht hängend)');
    assert.equal(await pg.locator('#micBtn').getAttribute('aria-pressed'), 'false');
    assert.equal(st.parseBodies.length, 0, 'ohne Sprache keine KI-Anfrage');
    await pg.close();
  }
  { // Mikrofon-Recht verweigert: Meldung, App bleibt bedienbar
    const { pg, st } = await appPage({ speech: 'denied', parse: () => TWO });
    await pg.locator('#micBtn').click();
    await pg.getByText('Mikrofon nicht erlaubt.').waitFor();
    assert.equal(st.parseBodies.length, 0, 'ohne Sprache keine KI-Anfrage');
    await pg.locator('#text').fill('trotzdem tippen');
    await pg.locator('#text').press('Enter');
    await until2(() => st.posts.length === 1, pg);
    assert.equal(st.posts[0].text, 'trotzdem tippen');
    await pg.close();
  }

  console.log('SMOKE OK');
} finally {
  await browser.close();
  server.kill();
}
