import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveDark, readTheme, saveTheme, applyTheme } from '../src/lib/theme.js';

describe('resolveDark', () => {
  it('system folgt dem Gerät', () => {
    expect(resolveDark('system', true)).toBe(true);
    expect(resolveDark('system', false)).toBe(false);
  });
  it('dark und light sind fest', () => {
    expect(resolveDark('dark', false)).toBe(true);
    expect(resolveDark('light', true)).toBe(false);
  });
});

describe('readTheme', () => {
  const store = (v) => ({ getItem: () => v });
  it('gültiger Wert', () => expect(readTheme(store('dark'))).toBe('dark'));
  it('fehlender Wert → system', () => expect(readTheme(store(null))).toBe('system'));
  it('ungültiger Wert → system', () => expect(readTheme(store('blau'))).toBe('system'));
  it('Speicher wirft → system', () => expect(readTheme({ getItem() { throw new Error('blockiert'); } })).toBe('system'));
});

describe('saveTheme', () => {
  it('schreibt unter dem Schlüssel theme', () => {
    const calls = [];
    saveTheme('dark', { setItem: (k, v) => calls.push([k, v]) });
    expect(calls).toEqual([['theme', 'dark']]);
  });
  it('schluckt Fehler des Speichers', () => {
    expect(() => saveTheme('dark', { setItem() { throw new Error('voll'); } })).not.toThrow();
  });
});

describe('applyTheme', () => {
  const root = () => { const r = { on: null, classList: { toggle(_c, on) { r.on = on; } } }; return r; };
  it('dark schaltet ein', () => { const r = root(); applyTheme('dark', r, false); expect(r.on).toBe(true); });
  it('system + dunkles Gerät schaltet ein', () => { const r = root(); applyTheme('system', r, true); expect(r.on).toBe(true); });
  it('light schaltet aus', () => { const r = root(); applyTheme('light', r, true); expect(r.on).toBe(false); });
});

it('Inline-Skript im head setzt die Klasse vor dem ersten Zeichnen', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/<script id="theme-init">([\s\S]*?)<\/script>/);
  expect(m, 'script#theme-init fehlt').not.toBeNull();
  const run = (stored, prefersDark) => {
    const calls = [];
    const doc = { documentElement: { classList: { toggle: (c, on) => calls.push([c, on]) } } };
    const ls = { getItem: () => stored };
    new Function('localStorage', 'matchMedia', 'document', m[1])(ls, () => ({ matches: prefersDark }), doc);
    return calls;
  };
  expect(run('dark', false)).toEqual([['dark', true]]);
  expect(run('light', true)).toEqual([['dark', false]]);
  expect(run(null, true)).toEqual([['dark', true]]);
  expect(run('kaputt', false)).toEqual([['dark', false]]);
});
