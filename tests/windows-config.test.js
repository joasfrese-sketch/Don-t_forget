import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const pkg = JSON.parse(read('package.json'));

describe('Windows-App: Paket-Konfiguration (electron-builder)', () => {
  it('Einstiegspunkt und Dateien existieren', () => {
    expect(pkg.main).toBe('desktop/main.cjs');
    for (const f of ['desktop/main.cjs', 'desktop/preload.cjs', 'desktop/scheduler.cjs', 'desktop/paths.cjs', 'desktop/icon.png', 'desktop/icon.ico']) {
      expect(existsSync(new URL(f, root)), f).toBe(true);
    }
  });
  it('App-Kennung (auch für Windows-Nachrichten) und Name', () => {
    expect(pkg.build.appId).toBe('de.dontforget.app');
    expect(pkg.build.productName).toBe("Don't forget");
    expect(read('desktop/main.cjs')).toContain("const APP_ID = 'de.dontforget.app'");
  });
  it('Installer für den aktuellen Benutzer, ohne Administrator, feste Dateibezeichnung', () => {
    expect(pkg.build.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
    expect(pkg.build.nsis.oneClick).toBe(true);
    expect(pkg.build.nsis.perMachine).toBe(false);
    expect(pkg.build.nsis.artifactName).toBe('Dont-forget-Setup.${ext}');
    expect(pkg.build.directories.output).toBe('release');
  });
  it('nur die App kommt in das Paket (kein Test-, Android- oder Quellcode-Ballast); Eigenes Schema braucht kein asar', () => {
    expect(pkg.build.files).toEqual(['dist/**/*', 'desktop/**/*', 'package.json']);
    expect(pkg.build.asar).toBe(false);
    expect(pkg.build.win.icon).toBe('desktop/icon.ico');
  });
  it('Symbol: gültige ICO-Datei mit allen Größen bis 256', () => {
    const buf = readFileSync(new URL('desktop/icon.ico', root));
    expect([buf.readUInt16LE(0), buf.readUInt16LE(2), buf.readUInt16LE(4)]).toEqual([0, 1, 7]);
    const sizes = Array.from({ length: 7 }, (_, i) => buf.readUInt8(6 + 16 * i) || 256);
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });
  it('Programmname in der Datei package.json (bestimmt den Datenordner %APPDATA%\\Don\'t forget)', () => {
    expect(pkg.productName).toBe("Don't forget");
  });
  it('Skripte', () => {
    expect(pkg.scripts.desktop).toBe('electron .');
    expect(pkg.scripts['dist:win']).toContain('--publish never');
    expect(pkg.scripts['test:desktop']).toContain('tests/e2e/desktop.mjs');
  });
  it('Electron und electron-builder sind nur Entwicklungs-Abhängigkeiten', () => {
    expect(pkg.devDependencies.electron).toBeTruthy();
    expect(pkg.devDependencies['electron-builder']).toBeTruthy();
    expect(pkg.dependencies?.electron).toBeUndefined();
  });
});

describe('Windows-Hauptprozess: Sicherheitseinstellungen', () => {
  const main = read('desktop/main.cjs');
  it('Fenster ohne Node, mit Isolation und Sandbox', () => {
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('sandbox: true');
  });
  it('Navigation und neue Fenster gesperrt, Berechtigungen verweigert', () => {
    expect(main).toContain("action: 'deny'");
    expect(main).toContain('will-navigate');
    expect(main).toContain('setPermissionRequestHandler');
    expect(main).toContain('setPermissionCheckHandler');
  });
  it('Einzelinstanz und Schließen ins Tray', () => {
    expect(main).toContain('requestSingleInstanceLock');
    expect(main).toContain('win.hide()');
  });
  it('Haken „Mit Windows starten“ liest den Eintrag mit denselben Argumenten wie beim Schreiben (sonst steht er auf Windows immer auf „aus“)', () => {
    expect(main).toContain("app.getLoginItemSettings({ args: ['--hidden'] })");
    expect(main).toContain("app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] })");
  });
  it('Nachrichten-Objekte werden festgehalten (sonst gehen Klicks auf Windows verloren)', () => {
    expect(main).toContain('activeToasts');
  });
  it('Windows-Herunterfahren wird nicht blockiert (Fenster nur verstecken, aber nicht beim Abmelden/Herunterfahren)', () => {
    expect(main).toContain("'session-end'");
  });
  it('Claude-Aufruf über den Hauptprozess: bereinigte Optionen und Zeitgrenze', () => {
    expect(main).toContain('sanitizeFetchInit');
    expect(main).toContain('AbortSignal.timeout');
  });
  it('„Schon angezeigt“-Datei atomar geschrieben, nur Dateien (keine Ordner) ausgeliefert', () => {
    expect(main).toContain('writeJsonAtomic');
    expect(main).toContain('isFile()');
  });
  it('kein Auslösen der Test-Haken ohne Umgebungsvariable', () => {
    expect(main).toMatch(/if \(TEST_LOG\) global\.__dtfTest/);
  });
});

describe('GitHub-Actions-Workflow (Windows-Installer bauen)', () => {
  const wf = () => read('.github/workflows/windows.yml');
  it('baut bei Push und auf Knopfdruck, auf Windows', () => {
    expect(wf()).toMatch(/on:\s*\n\s+push:/);
    expect(wf()).toContain('workflow_dispatch');
    expect(wf()).toContain('runs-on: windows-latest');
  });
  it('Node 22, Installation, Web-Bau, Installer, Artefakt (die Tests laufen schon im Android-Workflow)', () => {
    const w = wf();
    for (const part of ['node-version: 22', 'npm ci', 'npm run build', 'npx electron-builder --win nsis --publish never', 'actions/upload-artifact', 'dont-forget-windows', 'release/Dont-forget-Setup.exe']) {
      expect(w, part).toContain(part);
    }
  });
  it('braucht keine Geheimnisse und veröffentlicht nichts', () => {
    expect(wf()).not.toMatch(/secrets\./);
    expect(wf()).not.toMatch(/gh release|action-gh-release|--publish always/);
    expect(wf()).toMatch(/permissions:\s*\n\s+contents: read/);
  });
});
