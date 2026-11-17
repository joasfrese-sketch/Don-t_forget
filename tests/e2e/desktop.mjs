// Test der Windows-App mit echtem Electron (unter Linux per xvfb): npm run test:desktop
// Prüft den Hauptprozess: Fenster, Speicher, Planung und Nachrichten, Tray/Schließen, Einzelinstanz, Sicherheit.
// Nicht prüfbar hier: Windows-Toast-Darstellung, Installer, Autostart-Eintrag in der Windows-Registry.
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');
const electronPath = require('electron'); // Pfad zur Electron-Datei des Projekts

execSync('npx vite build', { stdio: 'ignore' });

const work = mkdtempSync(join(tmpdir(), 'dtf-desktop-'));
const userData = join(work, 'userdata');
const log = join(work, 'shown.log');
const env = { ...process.env, DTF_USER_DATA: userData, DTF_TEST_LOG: log, DTF_TICK_MS: '300', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' };
const ARGS = ['.', '--no-sandbox', '--disable-gpu'];
const shown = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await sleep(100); } throw new Error('Zeitüberschreitung: ' + what); };

async function launch() {
  const app = await electron.launch({ executablePath: electronPath, args: ARGS, env });
  const page = await app.firstWindow();
  await page.locator('#text').waitFor();
  return { app, page };
}
const entry = (id, atMs, o = {}) => ({ id, atMs, title: "Don't forget", body: 'Test ' + id, kind: 'reminder', noteId: null, ...o });

try {
  // ------------------------------------------------ Start, Brücke, Speicher über Neustart
  {
    const { app, page } = await launch();
    assert.match(page.url(), /^dtf:\/\/app\//, 'lädt über das eigene Schema');
    assert.equal(await page.title(), "Don't forget");
    assert.equal(await page.evaluate(() => typeof window.dtfDesktop?.schedule), 'function');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined', 'kein Node im Fenster');
    assert.equal(await page.evaluate(() => typeof window.process), 'undefined', 'kein process im Fenster');
    assert.equal(await page.locator('#micBtn').count(), 0, 'kein Mikrofon-Knopf');
    assert.equal(await page.locator('#notice').isVisible(), false, 'keine Erlaubnis-Frage');

    await page.locator('#text').fill('Mama anrufen');
    await page.locator('#text').press('Enter');
    await page.getByText('Mama anrufen').waitFor();
    await page.close(); await app.close();
  }
  {
    const { app, page } = await launch();
    await page.getByText('Mama anrufen').waitFor(); // Notiz bleibt nach Neustart
    await app.close();
  }

  // ------------------------------------------------ Nachrichten zur Zeit, Ersetzen, Nachholen, nichts doppelt
  {
    const { app, page } = await launch();
    const now = Date.now();
    await page.evaluate(([a, b, c]) => window.dtfDesktop.schedule([a, b, c]), [entry(1, now + 1500), entry(2, now + 60_000), entry(3, now + 1500)]);
    await page.evaluate(([x]) => window.dtfDesktop.schedule(x), [[entry(1, now + 1500), entry(2, now + 60_000)]]); // 3 wurde in der App erledigt
    await until(() => shown().some((s) => s.id === 1), 'Erinnerung 1 kommt pünktlich');
    await sleep(800);
    assert.deepEqual(shown().map((s) => s.id), [1], 'nur 1: 2 liegt in der Zukunft, 3 wurde ersetzt');
    assert.equal(shown()[0].body, 'Test 1');

    // verpasst (PC war aus): einmal nachholen, ältere als 6 Stunden verwerfen
    const t = Date.now();
    await page.evaluate(([a, b]) => window.dtfDesktop.schedule([a, b]), [entry(10, t - 3600e3), entry(11, t - 7 * 3600e3)]);
    await until(() => shown().some((s) => s.id === 10), 'Verpasstes wird nachgeholt');
    await sleep(800);
    assert.equal(shown().some((s) => s.id === 11), false, 'älter als 6 Stunden: still verworfen');

    // cancelAll
    await page.evaluate(() => window.dtfDesktop.schedule([{ id: 20, atMs: Date.now() + 1500, title: 't', body: 'b', kind: 'reminder', noteId: null }]));
    await page.evaluate(() => window.dtfDesktop.cancelAll());
    await sleep(2500);
    assert.equal(shown().some((s) => s.id === 20), false, 'nach cancelAll nichts mehr');
    await app.close();
  }
  {
    // Neustart: Schon Angezeigtes kommt nicht noch einmal
    const { app, page } = await launch();
    const keys = JSON.parse(readFileSync(join(userData, 'shown.json'), 'utf8'));
    const key1 = keys.find((k) => k.startsWith('1@'));
    assert.ok(key1, 'Angezeigtes wurde gemerkt');
    const atMs = Number(key1.split('@')[1]);
    const countBefore = shown().filter((s) => s.id === 1).length;
    await page.evaluate((x) => window.dtfDesktop.schedule([x]), entry(1, atMs)); // dieselbe Erinnerung wie vor dem Neustart
    await sleep(1500);
    assert.equal(shown().filter((s) => s.id === 1).length, countBefore, 'nichts doppelt nach Neustart');
    await app.close();
  }
  {
    // beschädigte „schon angezeigt“-Datei: kein Absturz
    writeFileSync(join(userData, 'shown.json'), '{kaputt');
    const { app, page } = await launch();
    await page.evaluate(() => window.dtfDesktop.schedule([{ id: 30, atMs: Date.now() + 1000, title: 't', body: 'nach kaputter Datei', kind: 'reminder', noteId: null }]));
    await until(() => shown().some((s) => s.id === 30), 'läuft trotz kaputter Datei');
    await app.close();
  }

  // ------------------------------------------------ Verpasst, weil der PC aus war: nach dem Start genau einmal
  {
    const first = await launch();
    const stamp = await first.page.evaluate(() => {
      const d = new Date(Date.now() - 2 * 3600e3); const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    });
    await first.page.locator('#changeWhen').click();
    await first.page.locator('#whenInput').fill(stamp);
    await first.page.locator('#whenInput').evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
    await first.page.keyboard.press('Escape');
    await first.page.locator('#text').click();
    await first.page.locator('#text').fill('Verpasst gewesen');
    await first.page.locator('#text').press('Enter');
    await until(() => shown().some((x) => x.body === 'Verpasst gewesen'), 'verpasste Erinnerung kommt über den Weg Fenster → Hauptprozess');
    await first.app.close();
    const count = () => shown().filter((x) => x.body === 'Verpasst gewesen').length;
    assert.equal(count(), 1, 'genau einmal');
    // App startet erneut (PC wurde neu gestartet): nicht noch einmal
    const second = await launch();
    await sleep(2000);
    assert.equal(count(), 1, 'nach Neustart nicht doppelt');
    await second.app.close();
  }

  // ------------------------------------------------ Fenster schließen, Klick auf Nachricht, zweiter Start
  {
    const { app, page } = await launch();
    // Fenster schließen beendet die App nicht (Playwrights page.close() würde das Fenster zerstören, deshalb über BrowserWindow)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await sleep(300);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false, 'Fenster ist im Tray');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'Fenster existiert noch (nur versteckt)');

    // Klick auf die Nachricht öffnet das Fenster und die Notiz
    const noteId = JSON.parse(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript("localStorage.getItem('CapacitorStorage.dtf.notes')")))[0].id;
    await app.evaluate((_e, id) => global.__dtfTest.click({ noteId: id, kind: 'reminder' }), noteId);
    await sleep(500);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true, 'Fenster wieder sichtbar');
    const page2 = await app.firstWindow();
    await page2.locator('#eText').waitFor();
    assert.equal(await page2.locator('#eText').inputValue(), 'Mama anrufen');
    await page2.keyboard.press('Escape');

    // Fenster wieder verstecken; zweiter Start öffnet nur das vorhandene Fenster
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    const second = spawn(electronPath, ARGS, { env, stdio: 'ignore' });
    const code = await new Promise((resolve) => { second.on('exit', resolve); setTimeout(() => { second.kill(); resolve('hängt'); }, 15000); });
    assert.equal(code, 0, 'zweite Instanz beendet sich selbst');
    await sleep(500);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true, 'zweiter Start zeigt das vorhandene Fenster');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1, 'kein zweites Fenster');
    await app.close();
  }

  // ------------------------------------------------ Sicherheit
  {
    const { app, page } = await launch();
    // Navigation zu fremden Adressen gesperrt
    await page.evaluate(() => { location.href = 'https://example.com/'; });
    await sleep(800);
    assert.match(page.url(), /^dtf:\/\/app\//, 'bleibt in der App');
    // neues Fenster gesperrt
    const windowsBefore = app.windows().length;
    await page.evaluate(() => { window.open('https://example.com/'); });
    await sleep(500);
    assert.equal(app.windows().length, windowsBefore, 'kein neues Fenster');
    // Pfadtricks beim eigenen Schema
    for (const p of ['dtf://app/../package.json', 'dtf://app/%2e%2e/package.json', 'dtf://app/..%2fpackage.json', 'dtf://app/assets/%2e%2e/%2e%2e/package.json']) {
      const status = await page.evaluate((u) => fetch(u).then((r) => r.status, () => 'blockiert'), p);
      assert.ok(status === 403 || status === 404 || status === 'blockiert', `${p} → ${status}`);
    }
    assert.equal(await page.evaluate(() => fetch('dtf://app/index.html').then((r) => r.status)), 200);
    for (const dirUrl of ['dtf://app/assets', 'dtf://app/assets/']) {
      const status = await page.evaluate((u) => fetch(u).then((r) => r.status, () => 'blockiert'), dirUrl);
      assert.notEqual(status, 200, `Ordner ${dirUrl} darf nicht ausgeliefert werden (${status})`);
    }
    assert.equal(await page.evaluate(() => fetch('dtf://evil/index.html').then((r) => r.status, () => 'blockiert')) !== 200, true, 'fremder Host');
    // Claude-Brücke: nur die Anthropic-API
    for (const url of ['https://example.com/', 'http://api.anthropic.com/v1/messages', 'file:///etc/passwd', 'https://api.anthropic.com.evil.com/']) {
      const r = await page.evaluate((u) => window.dtfDesktop.fetch(u, { method: 'POST', headers: {}, body: 'x' }).then(() => 'ok', (e) => String(e.message)), url);
      assert.match(r, /nicht erlaubt/, `${url} muss abgelehnt werden (${r})`);
    }
    // Berechtigungen (Kamera, Mikrofon, Standort …) werden verweigert
    const perm = await page.evaluate(() => navigator.permissions.query({ name: 'geolocation' }).then((p) => p.state, () => 'fehler'));
    assert.notEqual(perm, 'granted');
    await app.close();
  }

  console.log('DESKTOP OK');
} finally {
  rmSync(work, { recursive: true, force: true });
}
