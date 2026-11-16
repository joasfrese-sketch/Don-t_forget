import { describe, it, expect } from 'vitest';
import { buildPayload, parseAction } from '../supabase/functions/_shared/reminders.ts';

describe('buildPayload', () => {
  it('enthält Titel, Text, ID, Token und URL', () => {
    expect(JSON.parse(buildPayload({ id: 'n1', text: 'Mama anrufen', action_token: 't1' }))).toEqual({
      title: "Don't forget", body: 'Mama anrufen', noteId: 'n1', token: 't1', url: '/#/n/n1',
    });
  });
  it('kürzt lange Texte auf 180 Zeichen', () => {
    const body = JSON.parse(buildPayload({ id: 'n', text: 'x'.repeat(300), action_token: 't' })).body;
    expect(body.length).toBe(180);
    expect(body.endsWith('…')).toBe(true);
  });
  it('lässt 180 Zeichen ungekürzt', () => {
    expect(JSON.parse(buildPayload({ id: 'n', text: 'x'.repeat(180), action_token: 't' })).body).toBe('x'.repeat(180));
  });
});

describe('parseAction', () => {
  it('gültig', () => expect(parseAction({ id: 'n1', token: 't', action: 'snooze' })).toEqual({ id: 'n1', token: 't', action: 'snooze' }));
  it('fehlendes Token', () => expect(parseAction({ id: 'n1', action: 'done' })).toBeNull());
  it('unbekannte Aktion', () => expect(parseAction({ id: 'n1', token: 't', action: 'delete' })).toBeNull());
  it('kein Objekt', () => expect(parseAction(null)).toBeNull());
});
