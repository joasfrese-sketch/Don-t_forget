import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { newDb, asUser, A, B } from './helpers/db.js';

let db;
const BERLIN = 'Europe/Berlin';

// reine Zeitregel: followup_time(jetzt, zone, abend ab, morgens um, stunden)
const ft = async (nowIso, { evening = '18:00', morning = '08:00', hours = 5, tz = BERLIN } = {}) =>
  (await db.query('select public.followup_time($1::timestamptz, $2, $3::time, $4::time, $5) as t', [nowIso, tz, evening, morning, hours])).rows[0].t.toISOString();

const addNote = async (user, { remindAt = "now() - interval '1 minute'", status = 'open' } = {}) =>
  (await db.query(`insert into public.notes (user_id, text, remind_at, status) values ($1, 'Test', ${remindAt}, $2) returning *`, [user, status])).rows[0];
const get = async (id) => (await db.query('select * from public.notes where id = $1', [id])).rows[0];
const claimNotes = async () => (await db.query('select * from public.claim_due_notes()')).rows;
const followups = async () => (await db.query('select * from public.claim_due_followups()')).rows;
const setFollowupDue = (id) => db.query("update public.notes set followup_at = now() - interval '1 minute' where id = $1", [id]);
const setSettings = (user, cols) => db.query(
  `insert into public.user_settings (user_id, ${Object.keys(cols).join(',')}) values ($1, ${Object.keys(cols).map((_, i) => '$' + (i + 2)).join(',')})
   on conflict (user_id) do update set ${Object.keys(cols).map((k) => `${k} = excluded.${k}`).join(',')}`, [user, ...Object.values(cols)]);

beforeAll(async () => {
  db = await newDb(['001_schema.sql', '002_app_secret.sql', '004_followup.sql']);
});
beforeEach(async () => {
  await db.exec('delete from public.notes; delete from public.user_settings');
});

describe('followup_time (Zeitregel)', () => {
  it('14:00 Berlin → 19:00 Berlin', async () => {
    expect(await ft('2026-11-16T13:00:00Z')).toBe('2026-11-16T18:00:00.000Z');
  });
  it('18:00 und 22:00 → nächster Tag 08:00', async () => {
    expect(await ft('2026-11-16T17:00:00Z')).toBe('2026-11-17T07:00:00.000Z');
    expect(await ft('2026-11-16T21:00:00Z')).toBe('2026-11-17T07:00:00.000Z');
  });
  it('00:30 und 03:00 → selber Tag 08:00', async () => {
    expect(await ft('2026-11-16T23:30:00Z')).toBe('2026-11-17T07:00:00.000Z'); // 00:30 am 17.11.
    expect(await ft('2026-11-17T02:00:00Z')).toBe('2026-11-17T07:00:00.000Z'); // 03:00 am 17.11.
  });
  it('genau um 08:00 zählt als Tag (+ Stunden)', async () => {
    expect(await ft('2026-11-16T07:00:00Z')).toBe('2026-11-16T12:00:00.000Z');
  });
  it('Zeitumstellung: 22:00 Berlin (MESZ) → 08:00 am nächsten Tag (MEZ)', async () => {
    expect(await ft('2026-10-24T20:00:00Z')).toBe('2026-10-25T07:00:00.000Z');
  });
  it('eigene Werte: 3 Stunden, abends ab 20:00, morgens 07:30', async () => {
    const o = { hours: 3, evening: '20:00', morning: '07:30' };
    expect(await ft('2026-11-16T13:00:00Z', o)).toBe('2026-11-16T16:00:00.000Z'); // 14:00 → 17:00
    expect(await ft('2026-11-16T19:30:00Z', o)).toBe('2026-11-17T06:30:00.000Z'); // 20:30 → 07:30 morgen
  });
});

describe('claim_due_notes setzt followup_at', () => {
  it('nach den Einstellungen des Nutzers', async () => {
    await setSettings(A, { followup_hours: 3, timezone: 'UTC', evening_from: '23:59', morning_at: '00:00' });
    const n = await addNote(A);
    const [c] = await claimNotes();
    expect(c.id).toBe(n.id);
    expect(new Date(c.followup_at) - new Date(c.sent_at)).toBe(3 * 3600e3);
  });
  it('Nutzer ohne user_settings bekommt die Vorgaben', async () => {
    const n = await addNote(B);
    const [c] = await claimNotes();
    const expected = await ft(c.sent_at.toISOString());
    expect(new Date(c.followup_at).toISOString()).toBe(expected);
    expect(c.id).toBe(n.id);
  });
  it('followup_enabled = false → followup_at bleibt leer', async () => {
    await setSettings(A, { followup_enabled: false });
    await addNote(A);
    const [c] = await claimNotes();
    expect(c.followup_at).toBeNull();
  });
  it('Einstellungen verbieten Abend vor Morgen', async () => {
    await expect(setSettings(A, { evening_from: '07:00', morning_at: '08:00' })).rejects.toThrow();
  });
});

describe('claim_due_followups', () => {
  it('eine Zeile pro Nutzer; open_count zählt alle erinnerten offenen Notizen', async () => {
    const n1 = await addNote(A); const n2 = await addNote(A); const n3 = await addNote(A);
    await claimNotes();
    await setFollowupDue(n1.id); await setFollowupDue(n2.id); // n3 hat seinen Zeitpunkt noch vor sich
    const rows = await followups();
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(A);
    expect(rows[0].open_count).toBe(3);
    expect(n3.id).toBeTruthy();
  });

  it('markiert nur fällige Notizen; die spätere bekommt ihren eigenen Hinweis', async () => {
    const n1 = await addNote(A); const n2 = await addNote(A);
    await claimNotes();
    await setFollowupDue(n1.id);
    expect(await followups()).toHaveLength(1);
    expect((await get(n1.id)).followup_sent_at).not.toBeNull();
    expect((await get(n2.id)).followup_sent_at).toBeNull();
    expect(await followups()).toEqual([]);          // zweiter Aufruf: nichts Neues
    await setFollowupDue(n2.id);
    const rows = await followups();                  // n2 wird fällig
    expect(rows).toHaveLength(1);
    expect(rows[0].open_count).toBe(2);
    expect((await get(n2.id)).followup_sent_at).not.toBeNull();
  });

  it('ohne fällige Notizen kommt nichts', async () => {
    await addNote(A);
    await claimNotes();
    expect(await followups()).toEqual([]);
  });

  it('erledigte Notiz löst keinen Hinweis aus', async () => {
    const n = await addNote(A);
    await claimNotes();
    await setFollowupDue(n.id);
    await db.query("update public.notes set status = 'done' where id = $1", [n.id]);
    expect(await followups()).toEqual([]);
  });

  it('Später (remind_at ändern) setzt followup_at und followup_sent_at zurück', async () => {
    const n = await addNote(A);
    await claimNotes();
    await setFollowupDue(n.id);
    await followups();
    await db.query("update public.notes set remind_at = now() + interval '1 hour' where id = $1", [n.id]);
    const after = await get(n.id);
    expect(after.followup_at).toBeNull();
    expect(after.followup_sent_at).toBeNull();
    expect(after.sent_at).toBeNull();
  });

  it('Nachfassen ausschalten stoppt bereits geplante Hinweise', async () => {
    const n = await addNote(A);
    await claimNotes();
    await setFollowupDue(n.id);
    await setSettings(A, { followup_enabled: false });
    expect(await followups()).toEqual([]);
  });

  it('getrennt pro Nutzer', async () => {
    const a = await addNote(A); const b = await addNote(B);
    await claimNotes();
    await setFollowupDue(a.id); await setFollowupDue(b.id);
    const rows = (await followups()).sort((x, y) => x.user_id.localeCompare(y.user_id));
    expect(rows.map((r) => [r.user_id, r.open_count])).toEqual([[A, 1], [B, 1]]);
  });

  it('Altbestand ohne followup_at bekommt keinen Hinweis', async () => {
    await addNote(A);
    await claimNotes();
    await db.query('update public.notes set followup_at = null');
    expect(await followups()).toEqual([]);
  });
});

describe('Rechte', () => {
  it('authenticated darf die neuen Funktionen nicht aufrufen', async () => {
    await asUser(db, A, async () => {
      await expect(db.query("select public.followup_time(now(), 'UTC', '18:00', '08:00', 5)")).rejects.toThrow();
      await expect(db.query('select public.followup_for_user(null, now())')).rejects.toThrow();
      await expect(db.query('select * from public.claim_due_followups()')).rejects.toThrow();
    });
  });

  it('RLS: Nutzer B sieht Nachfass-Spalten und Einstellungen von A nicht', async () => {
    const n = await addNote(A);
    await claimNotes();
    await setSettings(A, { followup_hours: 4 });
    await asUser(db, B, async () => {
      expect((await db.query('select count(*)::int as c from public.notes where id = $1', [n.id])).rows[0].c).toBe(0);
      expect((await db.query('select count(*)::int as c from public.user_settings')).rows[0].c).toBe(0);
    });
  });
});
