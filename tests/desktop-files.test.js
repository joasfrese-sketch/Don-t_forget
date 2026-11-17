import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeJsonAtomic, readJson } from '../desktop/files.cjs';

const dir = () => mkdtempSync(join(tmpdir(), 'dtf-files-'));

describe('writeJsonAtomic', () => {
  it('schreibt gültiges JSON, legt Ordner an und hinterlässt keine Zwischendatei', () => {
    const d = dir();
    const file = join(d, 'neu', 'shown.json');
    writeJsonAtomic(file, ['a@1', 'b@2']);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['a@1', 'b@2']);
    expect(readdirSync(join(d, 'neu'))).toEqual(['shown.json']);
    rmSync(d, { recursive: true, force: true });
  });
  it('überschreibt eine vorhandene Datei vollständig', () => {
    const d = dir();
    const file = join(d, 'x.json');
    writeJsonAtomic(file, { lang: 'x'.repeat(1000) });
    writeJsonAtomic(file, [1]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([1]);
    rmSync(d, { recursive: true, force: true });
  });
  it('schlägt das Umbenennen fehl, bleibt die alte Datei unverändert und es bleibt nichts Halbes liegen', () => {
    const d = dir();
    const file = join(d, 'x.json');
    writeFileSync(file, '["alt"]');
    const fsFail = { mkdirSync: () => {}, writeFileSync: (f, c) => writeFileSync(f, c), renameSync: () => { throw new Error('gesperrt'); }, rmSync: (f) => rmSync(f, { force: true }) };
    expect(() => writeJsonAtomic(file, ['neu'], fsFail)).not.toThrow();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['alt']);
    expect(readdirSync(d)).toEqual(['x.json']);
    rmSync(d, { recursive: true, force: true });
  });
  it('Schreibfehler werfen nicht', () => {
    const fsFail = { mkdirSync: () => { throw new Error('Platte voll'); }, writeFileSync: () => {}, renameSync: () => {}, rmSync: () => {} };
    expect(() => writeJsonAtomic('/x/y.json', [1], fsFail)).not.toThrow();
  });
});

describe('readJson', () => {
  it('liest Gültiges, sonst den Ersatzwert (fehlend, kaputt, leer)', () => {
    const d = dir();
    writeFileSync(join(d, 'ok.json'), '["a"]');
    writeFileSync(join(d, 'kaputt.json'), '{kaputt');
    writeFileSync(join(d, 'leer.json'), '');
    expect(readJson(join(d, 'ok.json'), [])).toEqual(['a']);
    for (const f of ['kaputt.json', 'leer.json', 'gibt-es-nicht.json']) expect(readJson(join(d, f), 'fallback')).toBe('fallback');
    rmSync(d, { recursive: true, force: true });
  });
});
