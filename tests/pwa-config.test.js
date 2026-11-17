import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

describe('iPad / Web-App (GitHub Pages)', () => {
  it('Build verwendet relative Pfade (Unterordner auf github.io)', () => {
    expect(read('vite.config.js')).toMatch(/base:\s*'\.\/'/);
  });
  it('Manifest ist vollständig', () => {
    const m = JSON.parse(read('public/manifest.webmanifest'));
    expect(m.name).toBe("Don't forget");
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
    expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(read('index.html')).toContain('rel="manifest"');
  });
  it('Service Worker legt die App offline ab und ist nur über Relativpfade eingebunden', () => {
    expect(existsSync(new URL('public/sw.js', root))).toBe(true);
    expect(read('public/sw.js')).toContain("addEventListener('fetch'");
    expect(read('src/lib/pwa.js')).toContain('serviceWorker.register');
  });
  it('Pages-Workflow baut und veröffentlicht dist', () => {
    const y = read('.github/workflows/pages.yml');
    expect(y).toContain('actions/upload-pages-artifact');
    expect(y).toContain('actions/deploy-pages');
    expect(y).toContain('npm run build');
    expect(y).toContain('pages: write');
  });
});
