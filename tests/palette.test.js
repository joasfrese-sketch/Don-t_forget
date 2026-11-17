import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { palette } from '../palette.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const PAIRS = [['ink', 'page'], ['ink', 'card'], ['muted', 'page'], ['muted', 'card'], ['brand', 'page'], ['brand', 'card'], ['onBrand', 'brand'], ['danger', 'page'], ['danger', 'card']];

describe('Palette', () => {
  for (const mode of ['light', 'dark']) {
    it(`Textpaare erreichen WCAG AA (${mode})`, () => {
      for (const [fg, bg] of PAIRS) {
        const c = contrast(palette[mode][fg], palette[mode][bg]);
        expect(c, `${mode}: ${fg} auf ${bg} = ${c.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('kein Schwarz und kein Orange in der Palette', () => {
    for (const mode of ['light', 'dark']) {
      for (const [role, hex] of Object.entries(palette[mode])) {
        expect(hex.toLowerCase(), role).not.toBe('#000000');
        const [r, , b] = rgb(hex);
        expect(r > 200 && b < 80, `${mode}.${role} wirkt orange`).toBe(false);
      }
    }
  });
});

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

it('src und index.html nutzen keine amber-/stone-Klassen mehr', () => {
  const list = [...files(fileURLToPath(new URL('../src', import.meta.url))), fileURLToPath(new URL('../index.html', import.meta.url))];
  const bad = list.filter((f) => /\b(amber|stone)-\d{2,3}\b/.test(readFileSync(f, 'utf8')));
  expect(bad).toEqual([]);
});
