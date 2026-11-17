import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; }) : []);

describe('keine Cloud-Anbindung mehr (lokale App, nichts wird veröffentlicht)', () => {
  it('Server- und Veröffentlichungs-Dateien sind weg', () => {
    for (const p of ['supabase', 'vercel.json', '.env.example', '.env', 'scripts/build-sql.mjs', 'public/sw.js', 'src/lib/supabase.js', 'src/lib/push.js', 'src/ui/login.js']) {
      expect(existsSync(join(root, p)), p).toBe(false);
    }
  });

  it('Code und Paketdateien erwähnen weder Supabase noch Vercel noch Service Worker', () => {
    const list = [...files(join(root, 'src')), ...files(join(root, 'public')), join(root, 'index.html'), join(root, 'package.json')];
    const bad = list.filter((f) => /supabase|vercel|serviceWorker|service-worker|pglite/i.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('die einzige Netzwerk-Adresse im App-Code ist die Anthropic-API', () => {
    const urls = new Set();
    for (const f of files(join(root, 'src'))) for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/[^\s'"`)]+/g)) urls.add(new URL(m[0]).host);
    expect([...urls].filter((h) => !['api.anthropic.com', 'www.w3.org'].includes(h))).toEqual([]);
  });
});
