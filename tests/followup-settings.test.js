import { describe, it, expect } from 'vitest';
import { validateFollowup } from '../src/lib/followup-settings.js';

const ok = { followup_hours: 5, evening_from: '18:00', morning_at: '08:00' };

describe('validateFollowup', () => {
  it('Vorgaben sind gültig', () => expect(validateFollowup(ok)).toBeNull());
  it('Grenzen 1 und 24 sind gültig', () => {
    expect(validateFollowup({ ...ok, followup_hours: 1 })).toBeNull();
    expect(validateFollowup({ ...ok, followup_hours: 24 })).toBeNull();
  });
  for (const h of [0, 25, 2.5, NaN, -3]) {
    it(`Stunden ${h} sind ungültig`, () => expect(validateFollowup({ ...ok, followup_hours: h })).toBe('Stunden: 1 bis 24.'));
  }
  it('Abend gleich Morgen ist ungültig', () => {
    expect(validateFollowup({ ...ok, evening_from: '08:00', morning_at: '08:00' })).toBe('Abend muss nach dem Morgen liegen.');
  });
  it('Abend vor Morgen ist ungültig', () => {
    expect(validateFollowup({ ...ok, evening_from: '07:00', morning_at: '08:00' })).toBe('Abend muss nach dem Morgen liegen.');
  });
  it('leere Uhrzeit ist ungültig', () => {
    expect(validateFollowup({ ...ok, morning_at: '' })).toBe('Abend muss nach dem Morgen liegen.');
  });
});
