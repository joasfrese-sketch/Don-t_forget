import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
let db;

// Minimale Nachbildung dessen, was Supabase bereitstellt
const STUBS = `
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to authenticated, service_role;
  grant execute on function auth.uid() to authenticated, service_role;
  create schema vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  insert into vault.decrypted_secrets values ('cron_secret', 'c1'), ('vapid_private_key', 'p1'), ('other', 'x');
  insert into auth.users values ('${A}'), ('${B}');
`;

async function addNote(user, fields = {}) {
  const f = { text: 'Test', remind_at: "now() - interval '1 minute'", status: "'open'", ...fields };
  const r = await db.query(`insert into public.notes (user_id, text, remind_at, status) values ($1, $2, ${f.remind_at}, ${f.status}) returning *`, [user, f.text]);
  return r.rows[0];
}
const claim = async () => (await db.query('select * from public.claim_due_notes()')).rows;
const action = async (id, token, a) => (await db.query('select public.note_action($1, $2, $3) as ok', [id, token, a])).rows[0].ok;
const get = async (id) => (await db.query('select * from public.notes where id = $1', [id])).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  for (const f of ['001_schema.sql', '002_app_secret.sql']) {
    await db.exec(readFileSync(new URL('../supabase/migrations/' + f, import.meta.url), 'utf8'));
  }
});

describe('Schema', () => {
  it('claim_due_notes liefert fällige Notiz genau einmal', async () => {
    await db.exec('delete from public.notes');
    const n = await addNote(A);
    const first = await claim();
    expect(first.map((r) => r.id)).toEqual([n.id]);
    expect(first[0].sent_at).not.toBeNull();
    expect(await claim()).toEqual([]);
  });

  it('claim_due_notes ignoriert zukünftige und erledigte', async () => {
    await db.exec('delete from public.notes');
    await addNote(A, { remind_at: "now() + interval '1 hour'" });
    await addNote(A, { status: "'done'" });
    expect(await claim()).toEqual([]);
  });

  it('note_action done mit richtigem Token', async () => {
    const n = await addNote(A);
    expect(await action(n.id, n.action_token, 'done')).toBe(true);
    expect((await get(n.id)).status).toBe('done');
  });

  it('note_action snooze', async () => {
    const n = await addNote(A);
    await claim();
    expect(await action(n.id, n.action_token, 'snooze')).toBe(true);
    const s = await get(n.id);
    expect(Math.abs(new Date(s.remind_at) - (Date.now() + 3600e3))).toBeLessThan(5000);
    expect(s.sent_at).toBeNull();
    expect(s.action_token).not.toBe(n.action_token);
    expect(s.status).toBe('open');
  });

  it('note_action mit altem Token nach snooze', async () => {
    const n = await addNote(A);
    await action(n.id, n.action_token, 'snooze');
    expect(await action(n.id, n.action_token, 'done')).toBe(false);
    expect((await get(n.id)).status).toBe('open');
  });

  it('note_action mit unbekannter Aktion', async () => {
    const n = await addNote(A);
    expect(await action(n.id, n.action_token, 'delete')).toBe(false);
  });

  it('remind_at ändern setzt sent_at zurück', async () => {
    await db.exec('delete from public.notes');
    const n = await addNote(A);
    await claim();
    await db.query("update public.notes set remind_at = now() + interval '2 hours' where id = $1", [n.id]);
    expect((await get(n.id)).sent_at).toBeNull();
  });

  it('Textänderung lässt sent_at stehen', async () => {
    await db.exec('delete from public.notes');
    const n = await addNote(A);
    await claim();
    await db.query("update public.notes set text = 'neu' where id = $1", [n.id]);
    expect((await get(n.id)).sent_at).not.toBeNull();
  });

  it('leerer Text wird abgelehnt', async () => {
    await expect(addNote(A, { text: '   ' })).rejects.toThrow();
  });

  it('RLS: Nutzer B sieht Notiz von A nicht', async () => {
    await db.exec('delete from public.notes');
    await addNote(A);
    await db.exec(`set role authenticated; set test.uid = '${B}'`);
    try {
      expect((await db.query('select count(*)::int as c from public.notes')).rows[0].c).toBe(0);
      await db.exec(`set test.uid = '${A}'`);
      expect((await db.query('select count(*)::int as c from public.notes')).rows[0].c).toBe(1);
    } finally {
      await db.exec('reset role; reset test.uid');
    }
  });

  it('RLS: Nutzer darf keine Notiz für andere anlegen', async () => {
    await db.exec(`set role authenticated; set test.uid = '${B}'`);
    try {
      await expect(db.query(`insert into public.notes (user_id, text, remind_at) values ('${A}', 'x', now())`)).rejects.toThrow();
    } finally {
      await db.exec('reset role; reset test.uid');
    }
  });

  it('authenticated darf claim_due_notes nicht aufrufen', async () => {
    await db.exec(`set role authenticated; set test.uid = '${A}'`);
    try {
      await expect(db.query('select * from public.claim_due_notes()')).rejects.toThrow();
    } finally {
      await db.exec('reset role; reset test.uid');
    }
  });

  it('app_secret liefert erlaubte Secrets an service_role', async () => {
    await db.exec('set role service_role');
    try {
      expect((await db.query("select public.app_secret('cron_secret') as v")).rows[0].v).toBe('c1');
      expect((await db.query("select public.app_secret('vapid_private_key') as v")).rows[0].v).toBe('p1');
      expect((await db.query("select public.app_secret('other') as v")).rows[0].v).toBeNull();
    } finally {
      await db.exec('reset role');
    }
  });

  it('authenticated darf app_secret nicht aufrufen', async () => {
    await db.exec(`set role authenticated; set test.uid = '${A}'`);
    try {
      await expect(db.query("select public.app_secret('cron_secret')")).rejects.toThrow();
    } finally {
      await db.exec('reset role; reset test.uid');
    }
  });
});
