import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveAppPath, isAllowedFetchUrl, sanitizeFetchInit } from '../desktop/paths.cjs';

const DIST = '/app/dist';

describe('resolveAppPath', () => {
  it('Wurzel und Dateien', () => {
    expect(resolveAppPath(DIST, '/')).toBe(path.join(DIST, 'index.html'));
    expect(resolveAppPath(DIST, '')).toBe(path.join(DIST, 'index.html'));
    expect(resolveAppPath(DIST, '/index.html')).toBe(path.join(DIST, 'index.html'));
    expect(resolveAppPath(DIST, '/assets/index-abc.js')).toBe(path.join(DIST, 'assets/index-abc.js'));
    expect(resolveAppPath(DIST, '/icon-192.png')).toBe(path.join(DIST, 'icon-192.png'));
  });
  it('Pfadtricks liefern nichts', () => {
    for (const p of ['/../secret', '/assets/../../secret', '/%2e%2e/secret', '/%2E%2E/secret', '/assets/%2e%2e/%2e%2e/x', '/..%2fsecret', '/assets\\..\\..\\x', '/a\0b', '/%00', '//etc/passwd', '/assets/..%5c..%5cx']) {
      expect(resolveAppPath(DIST, p), p).toBeNull();
    }
  });
  it('kaputte Prozent-Kodierung liefert nichts, kein Absturz', () => {
    expect(resolveAppPath(DIST, '/%E0%A4%A')).toBeNull();
    expect(resolveAppPath(DIST, '/%')).toBeNull();
  });
  it('Nicht-Text liefert nichts', () => {
    expect(resolveAppPath(DIST, undefined)).toBeNull();
    expect(resolveAppPath(DIST, 5)).toBeNull();
  });
  it('Verzeichnisname mit ähnlichem Anfang gilt nicht als innerhalb (dist-evil)', () => {
    expect(resolveAppPath('/app/dist', '/../dist-evil/x')).toBeNull();
  });
});

describe('resolveAppPath – Windows-Besonderheiten (dort werden Punkte und Leerzeichen am Namensende abgeschnitten)', () => {
  it('Segmente mit Punkt oder Leerzeichen am Ende werden abgelehnt (".. " wäre unter Windows ".."))', () => {
    for (const p of ['/assets/.. /x', '/assets/..%20/x', '/assets/..%20%20/x', '/assets/. /x', '/assets/%2e%20/x', '/assets/..../x', '/assets/file.js.', '/assets/file.js%20', '/x/.', '/x/..']) {
      expect(resolveAppPath(DIST, p), p).toBeNull();
    }
  });
  it('Doppelpunkt (Laufwerksbuchstabe, Alternative Datenströme) wird abgelehnt', () => {
    for (const p of ['/C:/Windows/win.ini', '/assets/x.js::$DATA', '/assets/x.js:stream', '/c:x']) {
      expect(resolveAppPath(DIST, p), p).toBeNull();
    }
  });
  it('Zeichen, die Windows in Dateinamen verbietet, werden abgelehnt', () => {
    for (const p of ['/a*b', '/a?b', '/a"b', '/a<b', '/a>b', '/a|b']) expect(resolveAppPath(DIST, p), p).toBeNull();
  });
  it('normale Dateien der App bleiben erreichbar (Bindestriche, Punkte in der Mitte, Unterstriche)', () => {
    expect(resolveAppPath(DIST, '/assets/index-CRJggrD0.js')).toBe(path.join(DIST, 'assets', 'index-CRJggrD0.js'));
    expect(resolveAppPath(DIST, '/assets/web-9tzcGxzS.js')).toBe(path.join(DIST, 'assets', 'web-9tzcGxzS.js'));
    expect(resolveAppPath(DIST, '/a.b.c/d_e-f.png')).toBe(path.join(DIST, 'a.b.c', 'd_e-f.png'));
  });
});

describe('sanitizeFetchInit (Claude-Aufruf über den Hauptprozess)', () => {
  it('erzwingt POST, Weiterleitungen als Fehler, behält nur zulässige Kopfzeilen und einen Text-Körper', () => {
    const out = sanitizeFetchInit({ method: 'DELETE', headers: { 'x-api-key': 'k', 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' }, body: '{"a":1}' });
    expect(out.method).toBe('POST');
    expect(out.redirect).toBe('error');
    expect(out.headers).toEqual({ 'x-api-key': 'k', 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' });
    expect(out.body).toBe('{"a":1}');
  });
  it('verwirft Kopfzeilen, die nicht Text sind oder nicht gebraucht werden (Host, Cookie, Länge, Verbindung …)', () => {
    const out = sanitizeFetchInit({ headers: { Host: 'evil.com', Cookie: 'a=b', 'Content-Length': '5', Connection: 'x', 'Transfer-Encoding': 'chunked', Authorization: 'Bearer x', 'x-api-key': 5, 'X-Other': 'ok' } });
    expect(out.headers).toEqual({});
  });
  it('Kopfzeilen sind unabhängig von der Schreibweise, Werte mit Zeilenumbruch werden verworfen', () => {
    const out = sanitizeFetchInit({ headers: { 'X-API-Key': 'k', 'Content-Type': 'application/json', 'anthropic-version': '2023\r\nX-Evil: 1' } });
    expect(out.headers).toEqual({ 'X-API-Key': 'k', 'Content-Type': 'application/json' });
  });
  it('Körper nur als Text und höchstens 100 000 Zeichen', () => {
    expect(sanitizeFetchInit({ body: { a: 1 } }).body).toBeUndefined();
    expect(sanitizeFetchInit({ body: 'x'.repeat(100_001) }).body).toBeUndefined();
    expect(sanitizeFetchInit({ body: 'x'.repeat(100_000) }).body).toHaveLength(100_000);
  });
  it('kaputte Eingaben führen nicht zum Absturz', () => {
    for (const bad of [undefined, null, 5, 'x', [], { headers: null }, { headers: 'x' }]) {
      expect(() => sanitizeFetchInit(bad)).not.toThrow();
      expect(sanitizeFetchInit(bad).method).toBe('POST');
    }
  });
});

describe('isAllowedFetchUrl', () => {
  it('nur die Anthropic-API über https', () => {
    expect(isAllowedFetchUrl('https://api.anthropic.com/v1/messages')).toBe(true);
  });
  it('alles andere nicht', () => {
    for (const u of [
      'http://api.anthropic.com/v1/messages', 'https://api.anthropic.com.evil.com/v1/messages', 'https://evil.com/https://api.anthropic.com/',
      'https://user:pw@api.anthropic.com/v1/messages', 'https://api.anthropic.com:8443/v1/messages', 'file:///etc/passwd', 'ftp://api.anthropic.com/',
      'https://anthropic.com/', '//api.anthropic.com/v1', 'api.anthropic.com/v1', '', null, undefined, 42, {},
      'https://api.anthropic.com@evil.com/', 'https://evil.com\\@api.anthropic.com/',
    ]) {
      expect(isAllowedFetchUrl(u), String(u)).toBe(false);
    }
  });
});
