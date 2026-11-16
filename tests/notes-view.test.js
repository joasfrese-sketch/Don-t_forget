import { it, expect } from 'vitest';
import { groupNotes } from '../src/lib/notes-view.js';

const now = new Date('2026-11-16T16:00:00Z');
const n = (id, remind_at, status = 'open', updated_at = '2026-11-16T10:00:00Z') => ({ id, remind_at, status, updated_at });

it('Notiz genau jetzt ist fällig', () => {
  expect(groupNotes([n('a', '2026-11-16T16:00:00Z')], now).due.map((x) => x.id)).toEqual(['a']);
});

it('fällig und anstehend aufsteigend sortiert', () => {
  const g = groupNotes([
    n('u2', '2026-11-18T10:00:00Z'), n('d2', '2026-11-16T15:00:00Z'),
    n('u1', '2026-11-17T10:00:00Z'), n('d1', '2026-11-15T15:00:00Z'),
  ], now);
  expect(g.due.map((x) => x.id)).toEqual(['d1', 'd2']);
  expect(g.upcoming.map((x) => x.id)).toEqual(['u1', 'u2']);
  expect(g.done).toEqual([]);
});

it('erledigte nach updated_at absteigend', () => {
  const g = groupNotes([
    n('x', '2026-11-10T10:00:00Z', 'done', '2026-11-12T10:00:00Z'),
    n('y', '2026-11-20T10:00:00Z', 'done', '2026-11-14T10:00:00Z'),
  ], now);
  expect(g.done.map((x) => x.id)).toEqual(['y', 'x']);
  expect(g.due).toEqual([]);
  expect(g.upcoming).toEqual([]);
});
