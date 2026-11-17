import { describe, it, expect } from 'vitest';
import { resolveAppPath, isAllowedFetchUrl } from '../desktop/paths.cjs';

const DIST = '/app/dist';

describe('resolveAppPath', () => {
  it('Wurzel und Dateien', () => {
    expect(resolveAppPath(DIST, '/')).toBe('/app/dist/index.html');
    expect(resolveAppPath(DIST, '')).toBe('/app/dist/index.html');
    expect(resolveAppPath(DIST, '/index.html')).toBe('/app/dist/index.html');
    expect(resolveAppPath(DIST, '/assets/index-abc.js')).toBe('/app/dist/assets/index-abc.js');
    expect(resolveAppPath(DIST, '/icon-192.png')).toBe('/app/dist/icon-192.png');
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
