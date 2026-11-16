import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBundle, FILES } from '../scripts/build-sql.mjs';
import { newDbFromSql, A } from './helpers/db.js';

const bundlePath = new URL('../supabase/komplett.sql', import.meta.url);

describe('supabase/komplett.sql', () => {
  it('enthält alle Migrationen in der richtigen Reihenfolge (001, 002, 004, 005)', () => {
    expect(FILES).toEqual(['001_schema.sql', '002_app_secret.sql', '004_followup.sql', '005_ai_usage.sql']);
    const text = readFileSync(bundlePath, 'utf8');
    const positions = FILES.map((f) => text.indexOf(`===== ${f} =====`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('ist nicht veraltet: entspricht genau den Einzeldateien (npm run build:sql)', () => {
    expect(readFileSync(bundlePath, 'utf8')).toBe(buildBundle());
  });

  it('läuft auf einer leeren Datenbank in einem Rutsch durch und legt alles an', async () => {
    const db = await newDbFromSql(readFileSync(bundlePath, 'utf8'));
    const tables = (await db.query("select table_name from information_schema.tables where table_schema = 'public' order by 1")).rows.map((r) => r.table_name);
    expect(tables).toEqual(['ai_usage', 'notes', 'push_subscriptions', 'user_settings']);
    const fns = (await db.query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1")).rows.map((r) => r.proname);
    for (const f of ['ai_usage_hit', 'app_secret', 'claim_due_followups', 'claim_due_notes', 'followup_for_user', 'followup_time', 'note_action']) expect(fns).toContain(f);
    // Probelauf: Notiz anlegen, erinnern, Nachfass-Zeitpunkt gesetzt
    await db.query("insert into public.notes (user_id, text, remind_at) values ($1, 'x', now() - interval '1 minute')", [A]);
    const [c] = (await db.query('select * from public.claim_due_notes()')).rows;
    expect(c.followup_at).not.toBeNull();
  });

  it('kann ein zweites Mal ausgeführt werden (idempotent)', async () => {
    const sql = readFileSync(bundlePath, 'utf8');
    const db = await newDbFromSql(sql);
    await expect(db.exec(sql)).resolves.not.toThrow();
  });
});
