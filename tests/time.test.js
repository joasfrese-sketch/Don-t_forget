import { describe, it, expect } from 'vitest';
import { defaultRemindAt, formatWhen, toLocalInputValue, zonedToUtc } from '../src/lib/time.js';
const B = 'Europe/Berlin';

describe('defaultRemindAt', () => {
  it('heute, wenn Standardzeit noch kommt', () => {
    expect(defaultRemindAt(new Date('2026-11-16T09:00:00Z'), '17:00', B).toISOString()).toBe('2026-11-16T16:00:00.000Z');
  });
  it('heute auch 30 s vorher', () => {
    expect(defaultRemindAt(new Date('2026-11-16T15:59:30Z'), '17:00', B).toISOString()).toBe('2026-11-16T16:00:00.000Z');
  });
  it('morgen, wenn genau erreicht', () => {
    expect(defaultRemindAt(new Date('2026-11-16T16:00:00Z'), '17:00', B).toISOString()).toBe('2026-11-17T16:00:00.000Z');
  });
  it('morgen, wenn vorbei', () => {
    expect(defaultRemindAt(new Date('2026-11-16T17:30:00Z'), '17:00', B).toISOString()).toBe('2026-11-17T16:00:00.000Z');
  });
  it('über Zeitumstellung (Ende Sommerzeit 25.10.2026)', () => {
    expect(defaultRemindAt(new Date('2026-10-24T18:00:00Z'), '17:00', B).toISOString()).toBe('2026-10-25T16:00:00.000Z');
  });
  it('Sommerzeit: 17:00 Berlin = 15:00Z', () => {
    expect(defaultRemindAt(new Date('2026-07-01T08:00:00Z'), '17:00', B).toISOString()).toBe('2026-07-01T15:00:00.000Z');
  });
  it('lokales Datum zählt, nicht UTC-Datum (00:30 Berlin)', () => {
    expect(defaultRemindAt(new Date('2026-11-16T23:30:00Z'), '17:00', B).toISOString()).toBe('2026-11-17T16:00:00.000Z');
  });
});

describe('formatWhen', () => {
  const now = new Date('2026-11-16T09:00:00Z'); // Mo
  it('heute', () => expect(formatWhen(new Date('2026-11-16T16:00:00Z'), now, B)).toBe('heute 17:00'));
  it('morgen', () => expect(formatWhen(new Date('2026-11-17T16:00:00Z'), now, B)).toBe('morgen 17:00'));
  it('gestern (für überfällige)', () => expect(formatWhen(new Date('2026-11-15T16:00:00Z'), now, B)).toBe('gestern 17:00'));
  it('später', () => expect(formatWhen(new Date('2026-11-20T08:00:00Z'), now, B)).toBe('Fr 20.11. 09:00'));
});

it('toLocalInputValue', () => {
  expect(toLocalInputValue(new Date('2026-11-16T16:00:00Z'), B)).toBe('2026-11-16T17:00');
});

it('zonedToUtc', () => {
  expect(zonedToUtc('2026-03-29', '09:00', B).toISOString()).toBe('2026-03-29T07:00:00.000Z');
});
