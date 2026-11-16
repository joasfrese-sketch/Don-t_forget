// Baut supabase/komplett.sql: alle Migrationen in der richtigen Reihenfolge in einer Datei
// (zum Einfügen in den Supabase SQL Editor). Aufruf: npm run build:sql
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 003_hardening gibt es nicht als Datei: ihr Inhalt steckt schon in 001_schema.sql.
export const FILES = ['001_schema.sql', '002_app_secret.sql', '004_followup.sql', '005_ai_usage.sql'];

const dir = new URL('../supabase/migrations/', import.meta.url);
const HEADER = `-- ============================================================================
-- Don't forget – komplettes Datenbank-Setup (Migrationen 001, 002, 004, 005 in einem Stück)
-- ============================================================================
-- So geht's: Supabase-Dashboard → SQL Editor → New query → ALLES einfügen → Run.
-- Vorher in Database → Extensions: pg_cron und pg_net einschalten (sonst wird der Minuten-Job übersprungen und nur gemeldet).
-- Die Datei darf mehrfach ausgeführt werden. Supabase fragt evtl. wegen "drop trigger" nach – bestätigen
-- (betrifft nur den eigenen Trigger user_settings_normalize_tz, keine Daten).
--
-- Danach (einmalig, Werte ersetzen) die Schlüssel im Vault ablegen – NICHT Teil dieser Datei, weil geheim:
--   select vault.create_secret('https://DEIN_PROJEKT_REF.supabase.co', 'project_url');
--   select vault.create_secret('DEIN_CRON_SECRET',                      'cron_secret');
--   select vault.create_secret('mailto:deine@email.de',                 'vapid_subject');
--   select vault.create_secret('PUBLIC_KEY',                            'vapid_public_key');
--   select vault.create_secret('PRIVATE_KEY',                           'vapid_private_key');
-- (Schlüsselpaar erzeugen: npx web-push generate-vapid-keys)
-- Den Block "Jede Minute fällige Erinnerungen verschicken" am Ende von 001 danach einmal erneut ausführen,
-- falls er beim ersten Mal wegen fehlender Extensions übersprungen wurde.
--
-- Hinweis: Eine Migration 003 gibt es nicht – ihr Inhalt (fester search_path, pg_net im Schema "extensions")
-- steckt schon in 001.
-- ============================================================================
`;

export function buildBundle() {
  const parts = FILES.map((f) => `\n-- ===== ${f} =====\n\n${readFileSync(new URL(f, dir), 'utf8').trimEnd()}\n`);
  return HEADER + parts.join('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('../supabase/komplett.sql', import.meta.url), buildBundle());
  console.log('supabase/komplett.sql geschrieben');
}
