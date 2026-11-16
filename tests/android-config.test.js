import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

describe('Capacitor-Konfiguration', () => {
  const cfg = JSON.parse(read('capacitor.config.json'));
  it('App-Name, Kennung und Web-Ordner', () => {
    expect(cfg.appName).toBe("Don't forget");
    expect(cfg.appId).toBe('de.dontforget.app');
    expect(cfg.webDir).toBe('dist');
  });
  it('Benachrichtigungen: eigenes kleines Symbol und Akzentfarbe', () => {
    expect(cfg.plugins.LocalNotifications.smallIcon).toBe('ic_stat_bell');
    expect(cfg.plugins.LocalNotifications.iconColor).toBe('#1e3a5f');
  });
  it('kein Zugriff auf Server: keine server.url, kein Klartext-Verkehr erlaubt', () => {
    expect(cfg.server?.url).toBeUndefined();
    expect(cfg.server?.cleartext).not.toBe(true);
  });
});

describe('Android-Projekt', () => {
  const manifest = () => read('android/app/src/main/AndroidManifest.xml');
  it('Projekt ist vorhanden', () => {
    expect(existsSync(new URL('android/app/src/main/AndroidManifest.xml', root))).toBe(true);
    expect(existsSync(new URL('android/gradlew', root))).toBe(true);
  });
  it('Berechtigungen der App: exakte Alarme ohne Nachfrage (Android 14), Vibration, Internet für Claude', () => {
    const m = manifest();
    for (const p of ['USE_EXACT_ALARM', 'VIBRATE', 'INTERNET']) expect(m, p).toContain(`android.permission.${p}`);
  });
  it('Plugin bringt Alarm-Empfänger, Neustart-Wiederherstellung und seine Berechtigungen selbst mit (werden beim Bau zusammengeführt)', () => {
    const plugin = readFileSync(new URL('node_modules/@capacitor/local-notifications/android/src/main/AndroidManifest.xml', root), 'utf8');
    for (const part of ['TimedNotificationPublisher', 'LocalNotificationRestoreReceiver', 'android.intent.action.BOOT_COMPLETED', 'POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'RECEIVE_BOOT_COMPLETED']) {
      expect(plugin, part).toContain(part);
    }
    expect(read('android/capacitor.settings.gradle')).toContain('capacitor-local-notifications');
    expect(read('android/capacitor.settings.gradle')).toContain('capacitor-preferences');
  });
  it('kleines Symbol ic_stat_bell in allen Dichten', () => {
    for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      expect(existsSync(new URL(`android/app/src/main/res/drawable-${d}/ic_stat_bell.png`, root)), d).toBe(true);
    }
  });
  it('eigene App-Symbole (dunkelblauer Grund) statt Capacitor-Standard', () => {
    expect(read('android/app/src/main/res/values/ic_launcher_background.xml')).toContain('#1E3A5F');
    for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      expect(existsSync(new URL(`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, root)), d).toBe(true);
    }
  });
  it('App-Name auf dem Handy', () => {
    expect(read('android/app/src/main/res/values/strings.xml')).toContain("Don\\'t forget"); // Android schreibt das Apostroph mit Backslash
  });
});

describe('GitHub-Actions-Workflow (APK bauen)', () => {
  const wf = () => read('.github/workflows/android.yml');
  it('baut bei Push und auf Knopfdruck', () => {
    expect(wf()).toMatch(/on:\s*\n\s+push:/);
    expect(wf()).toContain('workflow_dispatch');
  });
  it('Node 22, Java 21, Tests, Web-Build, Sync, Gradle, Artefakt', () => {
    const w = wf();
    for (const part of ['node-version: 22', 'java-version: 21', 'npm ci', 'npx vitest run', 'npm run build', 'npx cap sync android', './gradlew assembleDebug', 'actions/upload-artifact', 'dont-forget-debug', 'app-debug.apk']) {
      expect(w, part).toContain(part);
    }
  });
  it('braucht keine Geheimnisse', () => {
    expect(wf()).not.toMatch(/secrets\./);
  });
});
