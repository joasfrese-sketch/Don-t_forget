// Gemeinsamer Aufbau für SQL-Tests: Supabase-Nachbau (Rollen, auth, vault) + Migrationen in PGlite.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export const A = '00000000-0000-0000-0000-00000000000a';
export const B = '00000000-0000-0000-0000-00000000000b';

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

export async function newDb(migrations) {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of migrations) await db.exec(readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url), 'utf8'));
  return db;
}

// Als eingeloggter Nutzer arbeiten; stellt die Rolle auch bei Fehlern zurück.
export async function asUser(db, uid, fn) {
  await db.exec(`set role authenticated; set test.uid = '${uid}'`);
  try { return await fn(); } finally { await db.exec('reset role; reset test.uid'); }
}

// Leere Datenbank (nur Supabase-Nachbau), darin beliebiges SQL ausführen – z. B. die gebündelte Datei.
export async function newDbFromSql(sql) {
  const db = new PGlite();
  await db.exec(STUBS);
  await db.exec(sql);
  return db;
}
