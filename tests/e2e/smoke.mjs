// Browser-Test der lokalen App (kein Server, kein Konto). Aufruf: npm run smoke
// Baut die App, startet `vite preview` und prüft die Oberfläche in Chromium mit fester Uhr (16.11.2026 10:00 Berlin).
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright'); // vorinstalliert, keine Projekt-Dependency

execSync('npx vite build', { stdio: 'ignore' });
const server = spawn('npx', ['vite', 'preview', '--port', '4317', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const NOW = '2026-11-16T09:00:00Z';
const KEY = (k) => 'CapacitorStorage.' + k; // so legt Capacitor Preferences im Browser ab
const browser = await chromium.launch();

const SPEECH = {
  none: `Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
         Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });`,
  ok: `window.SpeechRecognition = window.webkitSpeechRecognition = class {
         start() { Promise.resolve().then(() => { this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'morgen Zahnarzt anrufen' }], { isFinal: true })] }); this.onend && this.onend(); }); }
         stop() {}
       };`,
  denied: `window.SpeechRecognition = window.webkitSpeechRecognition = class {
         start() { Promise.resolve().then(() => { this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); }); }
         stop() {}
       };`,
  throws: `window.__starts = 0;
       window.SpeechRecognition = window.webkitSpeechRecognition = class {
         start() { window.__starts++; throw new Error('nicht nutzbar'); }
         stop() {}
       };`,
};

const seedNote = (nid, text, remind_at, o = {}) => ({
  id: 'seed-' + nid, nid, text, remind_at, custom_time: false, status: 'open',
  created_at: '2026-11-15T08:00:00.000Z', updated_at: '2026-11-15T08:00:00.000Z', ...o,
});

// Öffnet die App in einer frischen Seite. seed = { notes, settings, raw } für den lokalen Speicher.
async function openApp({ speech = 'none', seed = {}, anthropic, notification, desktop } = {}) {
  const page = await browser.newPage({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });
  await page.clock.install({ time: new Date(NOW) });
  const api = { requests: [] };
  await page.route('https://api.anthropic.com/**', (r) => {
    const req = r.request();
    api.requests.push({ headers: req.headers(), body: req.postDataJSON() });
    const res = anthropic ? anthropic() : { status: 500, json: {} };
    return r.fulfill({ status: res.status ?? 200, json: res.json });
  });
  await page.addInitScript(([seedJson, keyPrefix]) => {
    if (localStorage.getItem('__seeded')) return; // nur beim ersten Laden, nicht nach „Neuladen“
    localStorage.setItem('__seeded', '1');
    const s = JSON.parse(seedJson);
    if (s.notes) { localStorage.setItem(keyPrefix + 'dtf.notes', JSON.stringify(s.notes)); localStorage.setItem(keyPrefix + 'dtf.counter', String(Math.max(0, ...s.notes.map((n) => n.nid)))); }
    if (s.settings) localStorage.setItem(keyPrefix + 'dtf.settings', JSON.stringify(s.settings));
    for (const [k, v] of Object.entries(s.raw ?? {})) localStorage.setItem(keyPrefix + k, v);
  }, [JSON.stringify(seed), 'CapacitorStorage.']);
  await page.addInitScript(SPEECH[speech]);
  if (notification) { // künstliche Notification-Schnittstelle (Headless-Chromium meldet sonst immer „blockiert“)
    await page.addInitScript((initial) => {
      window.__shown = [];
      window.Notification = class {
        static permission = initial;
        static async requestPermission() { this.permission = 'granted'; return 'granted'; }
        constructor(title, o) { window.__shown.push([title, o && o.body]); }
      };
    }, notification);
  }
  if (desktop) { // künstliche Brücke wie sie der Preload der Windows-App bereitstellt
    await page.addInitScript(() => {
      window.__bridge = { calls: [], cb: null };
      window.dtfDesktop = {
        async schedule(list) { window.__bridge.calls.push(['schedule', list]); },
        async cancelAll() { window.__bridge.calls.push(['cancelAll']); },
        onAction(cb) { window.__bridge.cb = cb; },
        async getAutostart() { return window.__autostart ?? true; },
        async setAutostart(v) { window.__autostart = v; window.__bridge.calls.push(['autostart', v]); },
        async fetch(url, init) {
          window.__bridge.calls.push(['fetch', url, init.headers['x-api-key']]);
          return { status: 200, body: JSON.stringify({ content: [{ type: 'tool_use', name: 'create_notes', input: { notes: [{ text: 'Zahnarzt anrufen', date: null, time: null }] } }] }) };
        },
      };
    });
  }
  await page.goto('http://localhost:4317/');
  await page.locator('#text').waitFor();
  return { page, api };
}

const stored = (page, key) => page.evaluate(([k]) => JSON.parse(localStorage.getItem(k) ?? 'null'), [KEY(key)]);
const untilStored = (page, key, predicateSrc) => page.waitForFunction(([k, src]) => {
  const v = JSON.parse(localStorage.getItem(k) ?? 'null');
  return new Function('v', 'return ' + src)(v);
}, [KEY(key), predicateSrc]);
const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains('dark'));

// ---------------------------------------------------------------- Hauptfluss
{
  const { page } = await openApp();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'text', 'Eingabefeld fokussiert');
  assert.match(await page.locator('#whenLabel').textContent(), /heute 17:00/);
  // Ohne Erlaubnis sagt die Hauptansicht es klar (Headless-Chromium meldet Benachrichtigungen als blockiert)
  await page.locator('#notice').waitFor({ state: 'visible' });
  assert.match(await page.locator('#noticeText').textContent(), /Erinnerungen sind aus: Benachrichtigungen sind blockiert\./);
  await page.locator('#noticeBtn').click();
  await page.locator('#themeLight').waitFor(); // Einstellungen offen
  await page.locator('#sClose').click();
  await page.locator('#text').fill('Mama anrufen');
  await page.locator('#text').press('Enter');
  await page.getByText('Mama anrufen').waitFor();
  await untilStored(page, 'dtf.notes', 'v && v.length === 1');
  const [n] = await stored(page, 'dtf.notes');
  assert.deepEqual([n.text, n.remind_at, n.custom_time, n.status, n.nid], ['Mama anrufen', '2026-11-16T16:00:00.000Z', false, 'open', 1]);
  assert.equal(await page.locator('#text').inputValue(), '');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'text', 'Fokus bleibt');
  await page.reload();
  await page.getByText('Mama anrufen').waitFor(); // bleibt nach Neuladen
  await page.close();
}

// Eigene Zeit über „ändern“
{
  const { page } = await openApp();
  await page.locator('#changeWhen').click();
  await page.locator('#whenInput').fill('2026-11-20T09:00');
  await page.locator('#whenInput').evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.getByText('Fr 20.11. 09:00').first().waitFor();
  await page.keyboard.press('Escape'); // die Zeitauswahl schließen (in der echten App wechselt der Fokus von selbst)
  await page.locator('#text').click();
  await page.locator('#text').fill('Reifen wechseln');
  await page.locator('#text').press('Enter');
  await untilStored(page, 'dtf.notes', 'v && v.length === 1');
  const [n] = await stored(page, 'dtf.notes');
  assert.deepEqual([n.remind_at, n.custom_time], ['2026-11-20T08:00:00.000Z', true]);
  await page.close();
}

// ---------------------------------------------------------------- Fällig: Erledigt und Später
{
  const { page } = await openApp({ seed: { notes: [
    seedNote(1, 'fällig eins', '2026-11-16T08:00:00.000Z'),
    seedNote(2, 'fällig zwei', '2026-11-16T08:30:00.000Z'),
    seedNote(3, 'später dran', '2026-11-17T08:00:00.000Z'),
  ] } });
  await page.getByText('Fällig', { exact: true }).waitFor();
  await page.getByText('Anstehend', { exact: true }).waitFor();
  await page.locator('[data-done="seed-1"]').click();
  await untilStored(page, 'dtf.notes', "v.find((n) => n.id === 'seed-1').status === 'done'");
  await page.locator('[data-snooze="seed-2"]').click();
  // jetzt + 1 Stunde; die Uhr läuft nach dem Start weiter, deshalb mit Toleranz von 2 Minuten
  await untilStored(page, 'dtf.notes', "Math.abs(new Date(v.find((n) => n.id === 'seed-2').remind_at) - new Date('2026-11-16T10:00:00Z')) < 120000");
  await page.locator('#toggleDone').click();
  await page.getByText('erledigt', { exact: true }).waitFor();
  await page.close();
}

// ---------------------------------------------------------------- Bearbeiten, Wieder öffnen, Löschen
{
  const { page } = await openApp({ seed: { notes: [seedNote(1, 'alt', '2026-11-18T10:00:00.000Z')] } });
  await page.getByText('alt', { exact: true }).click();
  await page.locator('#eText').fill('neuer Text');
  await page.locator('#editForm button[value="save"]').click();
  await untilStored(page, 'dtf.notes', "v[0].text === 'neuer Text'");
  await page.locator('dialog').waitFor({ state: 'detached' });
  await page.getByText('neuer Text').waitFor();
  await page.getByText('neuer Text').click();
  await page.locator('#eToggle').click(); // Erledigt
  await untilStored(page, 'dtf.notes', "v[0].status === 'done'");
  await page.locator('dialog').waitFor({ state: 'detached' });
  await page.locator('#toggleDone').click();
  await page.getByText('neuer Text').click();
  await page.locator('#eToggle').click(); // Wieder öffnen → nächste Standardzeit
  await untilStored(page, 'dtf.notes', "v[0].status === 'open' && v[0].remind_at === '2026-11-16T16:00:00.000Z'");
  await page.locator('dialog').waitFor({ state: 'detached' });
  await page.getByText('neuer Text').click();
  page.once('dialog', (d) => d.accept());
  await page.locator('#eDelete').click();
  await untilStored(page, 'dtf.notes', 'v.length === 0');
  await page.close();
}

// ---------------------------------------------------------------- Einstellungen
{
  const { page } = await openApp();
  await page.locator('#openSettings').click();
  // Darstellung
  await page.locator('#themeDark').click();
  assert.equal(await isDark(page), true, 'Dunkel gesetzt');
  await page.reload();
  await page.locator('#text').waitFor();
  assert.equal(await isDark(page), true, 'Dunkel bleibt nach Neuladen');
  await page.locator('#themeLight').waitFor(); // Adresse #/einstellungen öffnet den Dialog nach dem Neuladen wieder
  await page.locator('#themeLight').click();
  assert.equal(await isDark(page), false, 'Hell gesetzt');
  // Konto-/Server-Bereiche gibt es nicht mehr
  assert.equal(await page.locator('#newPw, #accountEmail, #sLogout').count(), 0);
  // Standardzeit
  await page.locator('#sTime').fill('15:00');
  await page.locator('#sTime').evaluate((el) => el.blur());
  await untilStored(page, 'dtf.settings', "v.default_time === '15:00'");
  // Nachfassen
  const setField = async (sel, v) => { const l = page.locator(sel); await l.fill(v); await l.evaluate((el) => el.blur()); };
  await page.locator('#followupToggle').click();
  await setField('#fuHours', '3');
  await untilStored(page, 'dtf.settings', 'v.followup_hours === 3');
  await setField('#fuHours', '0');
  await page.getByText('Stunden: 1 bis 24.').waitFor();
  assert.equal(await page.locator('#fuHours').inputValue(), '3', 'springt auf letzten gültigen Wert zurück');
  assert.equal((await stored(page, 'dtf.settings')).followup_hours, 3, 'ungültiger Wert wird nicht gespeichert');
  await setField('#evening', '07:00');
  await page.getByText('Abend muss nach dem Morgen liegen.').waitFor();
  assert.equal((await stored(page, 'dtf.settings')).evening_from, '18:00');
  await page.locator('#fuEnabled').uncheck();
  await untilStored(page, 'dtf.settings', 'v.followup_enabled === false');
  assert.equal(await page.locator('#fuHours').isDisabled(), true, 'Felder bei „aus“ gesperrt');
  // Benachrichtigungen: Headless-Chromium meldet „blockiert“, dann gibt es keine Erlauben-Taste
  await page.locator('#notifStatus').filter({ hasText: 'Benachrichtigungen sind blockiert' }).waitFor();
  assert.equal(await page.locator('#notifAllow').isVisible(), false);
  await page.locator('#aiKey').fill('sk-ant-test');
  await page.locator('#aiKey').evaluate((el) => el.blur());
  await untilStored(page, 'dtf.settings', "v.ai_key === 'sk-ant-test'");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/settings.png`, fullPage: false });
  await page.locator('#sClose').click();
  await page.waitForFunction(() => document.querySelector('#whenLabel').textContent.includes('15:00'));
  await page.close();
}

// ---------------------------------------------------------------- Benachrichtigungen: Erlaubnis und pünktliche Meldung
{
  const { page } = await openApp({ notification: 'default' });
  await page.locator('#notice').waitFor({ state: 'visible' });
  assert.match(await page.locator('#noticeText').textContent(), /Erinnerungen sind noch nicht erlaubt\./);
  await page.locator('#openSettings').click();
  await page.getByText('Noch nicht erlaubt').waitFor();
  await page.locator('#notifAllow').click();
  await page.getByText('Erinnerungen sind eingeschaltet.').waitFor();
  assert.equal(await page.locator('#notifAllow').isVisible(), false);
  await page.locator('#notice').waitFor({ state: 'hidden' }); // nach der Erlaubnis verschwindet der Hinweis
  await page.close();
}
{
  // Erlaubnis liegt vor: eine Erinnerung in 2 Minuten kommt pünktlich, eine in 2 Tagen nicht; erledigte nie
  const { page } = await openApp({ notification: 'granted', seed: { settings: { followup_enabled: false }, notes: [
    seedNote(1, 'gleich dran', '2026-11-16T09:02:00.000Z'),
    seedNote(2, 'erst in zwei Tagen', '2026-11-18T09:00:00.000Z'),
    seedNote(3, 'schon erledigt', '2026-11-16T09:03:00.000Z', { status: 'done' }),
  ] } });
  await page.waitForTimeout(300); // Start: Plan wird angemeldet
  assert.equal(await page.locator('#notice').isVisible(), false, 'mit Erlaubnis kein Hinweis');
  assert.deepEqual(await page.evaluate(() => window.__shown), [], 'vorher nichts');
  await page.clock.fastForward(3 * 60 * 1000);
  assert.deepEqual(await page.evaluate(() => window.__shown), [["Don't forget", 'gleich dran']]);
  // Neue Notiz in der Zukunft: wird sofort mit eingeplant
  await page.locator('#changeWhen').click();
  await page.locator('#whenInput').fill('2026-11-16T10:10');
  await page.locator('#whenInput').evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.keyboard.press('Escape');
  await page.locator('#text').click();
  await page.locator('#text').fill('neu geplant');
  await page.locator('#text').press('Enter');
  await page.getByText('neu geplant').waitFor();
  await page.waitForTimeout(300);
  await page.clock.fastForward(10 * 60 * 1000);
  assert.deepEqual(await page.evaluate(() => window.__shown.map((x) => x[1])), ['gleich dran', 'neu geplant']);
  await page.close();
}
{
  // „Erledigt“ nimmt die Erinnerung zurück: nichts wird mehr ausgelöst
  const { page } = await openApp({ notification: 'granted', seed: { settings: { followup_enabled: false }, notes: [seedNote(1, 'doch erledigt', '2026-11-16T09:05:00.000Z')] } });
  await page.waitForTimeout(300);
  await page.getByText('doch erledigt').click();
  await page.locator('#eToggle').click();
  await untilStored(page, 'dtf.notes', "v[0].status === 'done'");
  await page.waitForTimeout(300);
  await page.clock.fastForward(10 * 60 * 1000);
  assert.deepEqual(await page.evaluate(() => window.__shown), []);
  await page.close();
}

// ---------------------------------------------------------------- Windows-App (künstliche Brücke)
{
  const { page } = await openApp({ desktop: true, speech: 'ok', seed: { settings: { followup_enabled: false, ai_key: 'sk-ant-test' } } });
  const calls = () => page.evaluate(() => window.__bridge.calls);
  const lastSchedule = async () => (await calls()).filter((c) => c[0] === 'schedule').at(-1)?.[1];
  assert.equal(await page.locator('#micBtn').count(), 0, 'kein Mikrofon in der Windows-App');
  assert.equal(await page.locator('#notice').isVisible(), false, 'keine Erlaubnis-Frage in der Windows-App');
  // Erinnerung anlegen → Plan geht an den Hauptprozess
  await page.locator('#changeWhen').click();
  await page.locator('#whenInput').fill('2026-11-16T18:00');
  await page.locator('#whenInput').evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
  await page.keyboard.press('Escape');
  await page.locator('#text').click();
  await page.locator('#text').fill('Mama anrufen');
  await page.locator('#text').press('Enter');
  await page.getByText('Mama anrufen').waitFor();
  await page.waitForFunction(() => window.__bridge.calls.some((c) => c[0] === 'schedule' && c[1].length === 1));
  const plan = await lastSchedule();
  assert.deepEqual([plan[0].title, plan[0].body, plan[0].kind, plan[0].atMs], ["Don't forget", 'Mama anrufen', 'reminder', Date.parse('2026-11-16T17:00:00Z')]);
  assert.ok(plan[0].noteId);
  // Klick auf die Nachricht öffnet die Notiz, „Erledigt“ ersetzt den Plan
  await page.evaluate((id) => window.__bridge.cb('tap', { noteId: id, kind: 'reminder' }), plan[0].noteId);
  await page.locator('#eText').waitFor();
  await page.keyboard.press('Escape');
  await page.evaluate((id) => window.__bridge.cb('done', { noteId: id, kind: 'reminder' }), plan[0].noteId);
  await untilStored(page, 'dtf.notes', "v[0].status === 'done'");
  await page.waitForFunction(() => { const c = window.__bridge.calls.filter((x) => x[0] === 'cancelAll'); return c.length >= 2; });
  assert.equal((await calls()).at(-1)[0], 'cancelAll', 'nach „Erledigt“ wird alles entfernt und nichts Neues geplant');
  // Start mit Windows
  await page.locator('#openSettings').click();
  await page.waitForFunction(() => { const b = document.querySelector('#autostart'); return b && !b.disabled; });
  assert.equal(await page.locator('#autostart').isChecked(), true);
  await page.locator('#autostart').uncheck();
  await page.waitForFunction(() => window.__bridge.calls.some((c) => c[0] === 'autostart' && c[1] === false));
  await page.locator('#sClose').click();
  // Claude über den Hauptprozess
  await page.locator('#text').fill('Zahnarzt anrufen');
  await page.locator('#aiBtn').click();
  await page.locator('#previewSave').waitFor();
  const fetchCall = (await calls()).find((c) => c[0] === 'fetch');
  assert.deepEqual([fetchCall[1], fetchCall[2]], ['https://api.anthropic.com/v1/messages', 'sk-ant-test']);
  await page.close();
}
{ // im Browser (ohne Brücke) gibt es den Windows-Abschnitt nicht
  const { page } = await openApp();
  await page.locator('#openSettings').click();
  await page.locator('#themeLight').waitFor();
  assert.equal(await page.locator('#autostart').count(), 0);
  await page.close();
}

// ---------------------------------------------------------------- kaputte lokale Daten
{
  const { page } = await openApp({ seed: { raw: { 'dtf.notes': '{kaputt', 'dtf.settings': '[1,2]' } } });
  assert.match(await page.locator('#whenLabel').textContent(), /heute 17:00/, 'Vorgaben statt Absturz');
  await page.locator('#text').fill('trotzdem');
  await page.locator('#text').press('Enter');
  await page.getByText('trotzdem').waitFor();
  await page.close();
}

// ---------------------------------------------------------------- Sprechen und ✨ (Claude direkt aus der App)
const TWO = () => ({ json: { content: [{ type: 'tool_use', name: 'create_notes', input: { notes: [
  { text: 'Reifen wechseln', date: '2026-11-20', time: '09:00' }, { text: 'Zahnarzt anrufen', date: null, time: null },
] } }] } });
const withKey = { settings: { ai_key: 'sk-ant-test' } };

{ // Ohne Schlüssel
  const { page, api } = await openApp({ anthropic: TWO });
  await page.locator('#text').fill('Zahnarzt');
  await page.locator('#aiBtn').click();
  await page.getByText('Claude-Schlüssel fehlt. Bitte in den Einstellungen eintragen.').waitFor();
  assert.equal(api.requests.length, 0, 'ohne Schlüssel kein Netzwerkzugriff');
  assert.equal(await page.locator('#text').inputValue(), 'Zahnarzt', 'Text bleibt im Feld');
  await page.close();
}
{ // Mit Schlüssel: Vorschau, Speichern
  const { page, api } = await openApp({ seed: withKey, anthropic: TWO });
  assert.equal(await page.locator('#micBtn').count(), 0, 'kein Mikrofon ohne Spracherkennung');
  assert.equal(await page.locator('#aiBtn').isDisabled(), true, '✨ bei leerem Feld gesperrt');
  await page.locator('#text').fill('Reifen am Freitag um 9 und Zahnarzt anrufen');
  assert.equal(await page.locator('#aiBtn').isDisabled(), false);
  await page.locator('#aiBtn').click();
  await page.locator('#previewSave').waitFor();
  assert.equal(api.requests[0].headers['x-api-key'], 'sk-ant-test');
  assert.equal(api.requests[0].body.messages[0].content, 'Reifen am Freitag um 9 und Zahnarzt anrufen');
  assert.equal(await page.locator('[data-row]').count(), 2);
  await page.getByText('Fr 20.11. 09:00').waitFor();
  await page.getByText('heute 17:00').first().waitFor();
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/preview-light.png` });
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(400);
    await page.screenshot({ path: `${process.env.SHOT_DIR}/preview-dark.png` });
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.locator('#previewSave').click();
  await untilStored(page, 'dtf.notes', 'v && v.length === 2');
  const notes = await stored(page, 'dtf.notes');
  assert.deepEqual(notes.map((n) => [n.text, n.remind_at, n.custom_time]), [
    ['Reifen wechseln', '2026-11-20T08:00:00.000Z', true],
    ['Zahnarzt anrufen', '2026-11-16T16:00:00.000Z', false],
  ]);
  assert.equal(await page.locator('#text').inputValue(), '', 'Feld nach dem Speichern leer');
  await page.close();
}
{ // Eintrag entfernen und Text ändern; Abbrechen
  const { page } = await openApp({ seed: withKey, anthropic: TWO });
  await page.locator('#text').fill('zwei Dinge');
  await page.locator('#aiBtn').click();
  await page.locator('#previewSave').waitFor();
  await page.locator('[data-remove="0"]').click();
  assert.equal(await page.locator('[data-row]').count(), 1);
  await page.locator('[data-field="text"]').fill('Zahnarzt Dr. Weber anrufen');
  await page.locator('#previewSave').click();
  await untilStored(page, 'dtf.notes', "v && v.length === 1 && v[0].text === 'Zahnarzt Dr. Weber anrufen'");
  await page.locator('#text').fill('doch nicht');
  await page.locator('#aiBtn').click();
  await page.locator('#previewCancel').click();
  assert.equal((await stored(page, 'dtf.notes')).length, 1, 'Abbrechen speichert nichts');
  assert.equal(await page.locator('#text').inputValue(), 'doch nicht');
  await page.close();
}
{ // Fehler von Claude
  for (const [res, msg] of [
    [{ status: 401, json: {} }, 'Der Claude-Schlüssel wurde abgelehnt.'],
    [{ status: 429, json: {} }, 'Claude ist gerade überlastet oder das Limit ist erreicht. Bitte tippen.'],
    [{ status: 500, json: {} }, 'Claude ist gerade nicht erreichbar. Bitte tippen.'],
    [{ json: { content: [] } }, 'Daraus konnte ich keinen Termin machen. Bitte tippen.'],
  ]) {
    const { page } = await openApp({ seed: withKey, anthropic: () => res });
    await page.locator('#text').fill('hm');
    await page.locator('#aiBtn').click();
    await page.getByText(msg).waitFor();
    assert.equal(await page.locator('#text').inputValue(), 'hm', 'Text bleibt im Feld');
    await page.close();
  }
}
{ // Mikrofon vorhanden
  const { page, api } = await openApp({ speech: 'ok', seed: withKey, anthropic: () => ({ json: { content: [{ type: 'tool_use', name: 'create_notes', input: { notes: [{ text: 'Zahnarzt anrufen', date: '2026-11-17', time: null }] } }] } }) });
  await page.locator('#micBtn').click();
  await page.locator('#previewSave').waitFor();
  assert.equal(api.requests[0].body.messages[0].content, 'morgen Zahnarzt anrufen');
  assert.equal(await page.locator('#text').inputValue(), 'morgen Zahnarzt anrufen');
  await page.getByText('morgen 17:00').first().waitFor();
  await page.close();
}
{ // Mikrofon-Recht verweigert: Meldung, App bleibt bedienbar
  const { page, api } = await openApp({ speech: 'denied', seed: withKey, anthropic: TWO });
  await page.locator('#micBtn').click();
  await page.getByText('Mikrofon nicht erlaubt.').waitFor();
  assert.equal(api.requests.length, 0, 'ohne Sprache keine KI-Anfrage');
  await page.locator('#text').fill('trotzdem tippen');
  await page.locator('#text').press('Enter');
  await untilStored(page, 'dtf.notes', "v && v.length === 1 && v[0].text === 'trotzdem tippen'");
  await page.close();
}
{ // start() wirft (z. B. iPad-App): Meldung, Knopf hängt nicht
  const { page, api } = await openApp({ speech: 'throws', seed: withKey, anthropic: TWO });
  await page.locator('#micBtn').click();
  await page.getByText('Spracherkennung hat nicht geklappt.').waitFor();
  assert.equal(await page.locator('#micBtn').getAttribute('aria-pressed'), 'false');
  await page.locator('#micBtn').click();
  await page.waitForFunction(() => window.__starts === 2);
  assert.equal(await page.locator('#micBtn').getAttribute('aria-pressed'), 'false');
  assert.equal(api.requests.length, 0);
  await page.close();
}

// ---------------------------------------------------------------- Ansicht Hell/Dunkel (nur mit SHOT_DIR)
if (process.env.SHOT_DIR) {
  const { page } = await openApp({ seed: { notes: [seedNote(1, 'Mama anrufen', '2026-11-16T16:00:00.000Z'), seedNote(2, 'Rechnung zahlen', '2026-11-18T08:00:00.000Z'), seedNote(3, 'fällig', '2026-11-16T08:00:00.000Z')] } });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${process.env.SHOT_DIR}/main-${scheme}.png`, fullPage: false });
  }
  await page.close();
}

await browser.close();
server.kill();
console.log('SMOKE OK');
