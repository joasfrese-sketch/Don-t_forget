-- ============================================================================
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

-- ===== 001_schema.sql =====

-- Don't forget – Datenbankschema
-- Im Supabase SQL-Editor ausführen. Idempotent bis auf den Cron-Block am Ende (der ist es auch).

-- ---------- Einstellungen ----------
create table if not exists public.user_settings (
  user_id      uuid primary key default auth.uid() references auth.users on delete cascade,
  default_time time not null default '17:00',
  timezone     text not null default 'Europe/Berlin'
);

-- ---------- Notizen ----------
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  text         text not null check (length(trim(text)) > 0),
  remind_at    timestamptz not null,
  custom_time  boolean not null default false,
  status       text not null default 'open' check (status in ('open', 'done')),
  sent_at      timestamptz,
  action_token text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists notes_due_idx on public.notes (status, remind_at) where sent_at is null;
create index if not exists notes_user_idx on public.notes (user_id);

create or replace function public.notes_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.remind_at is distinct from old.remind_at then
    new.sent_at := null;
    new.action_token := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end $$;

drop trigger if exists notes_before_update on public.notes;
create trigger notes_before_update before update on public.notes
  for each row execute function public.notes_before_update();

-- ---------- Push-Abos ----------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.user_settings enable row level security;
alter table public.notes enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists own_settings on public.user_settings;
create policy own_settings on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_notes on public.notes;
create policy own_notes on public.notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists own_subs on public.push_subscriptions;
create policy own_subs on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.user_settings, public.notes, public.push_subscriptions to authenticated, service_role;

-- ---------- Fällige Notizen atomar beanspruchen (nur Server) ----------
create or replace function public.claim_due_notes() returns setof public.notes
language sql security definer set search_path = public as $$
  update public.notes set sent_at = now()
  where id in (
    select id from public.notes
    where status = 'open' and sent_at is null and remind_at <= now()
    for update skip locked
  )
  returning *;
$$;
revoke all on function public.claim_due_notes() from public, anon, authenticated;
grant execute on function public.claim_due_notes() to service_role;

-- ---------- Knöpfe aus der Nachricht (nur Server) ----------
create or replace function public.note_action(p_id uuid, p_token text, p_action text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_action = 'done' then
    update public.notes set status = 'done'
      where id = p_id and action_token = p_token and status = 'open';
  elsif p_action = 'snooze' then
    update public.notes set remind_at = now() + interval '1 hour'
      where id = p_id and action_token = p_token and status = 'open';
  else
    return false;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.note_action(uuid, text, text) from public, anon, authenticated;
grant execute on function public.note_action(uuid, text, text) to service_role;

-- ---------- Realtime ----------
do $$
begin
  alter publication supabase_realtime add table public.notes;
exception when others then
  raise notice 'Realtime für notes nicht eingerichtet (%).', sqlerrm;
end $$;

-- ---------- Jede Minute fällige Erinnerungen verschicken ----------
-- Voraussetzung: Extensions pg_cron und pg_net aktiv, im Vault die Secrets
-- 'project_url' (z. B. https://xyz.supabase.co) und 'cron_secret' (wie CRON_SECRET der Edge Function).
do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;
  perform cron.schedule('dont-forget-reminders', '* * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb
    );
  $cron$);
exception when others then
  raise notice 'pg_cron/pg_net nicht eingerichtet (%). Extensions aktivieren und diesen Block erneut ausführen.', sqlerrm;
end $$;

-- ===== 002_app_secret.sql =====

-- Edge Functions lesen ihre Schlüssel aus dem Supabase Vault (statt aus Function-Secrets).
-- Nur für service_role, nur für die hier erlaubten Namen.
-- Vault-Einträge: project_url, cron_secret, vapid_subject, vapid_public_key, vapid_private_key
create or replace function public.app_secret(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name
    and p_name in ('cron_secret', 'vapid_subject', 'vapid_public_key', 'vapid_private_key')
  limit 1;
$$;
revoke all on function public.app_secret(text) from public, anon, authenticated;
grant execute on function public.app_secret(text) to service_role;

-- ===== 004_followup.sql =====

-- Nachfassen: Hinweis auf bereits erinnerte, aber nicht erledigte Notizen.
-- Regel (in der Zeitzone des Nutzers): ab "evening_from" → nächster Morgen "morning_at";
-- vor "morning_at" (Nacht) → am selben Tag "morning_at"; sonst nach "followup_hours" Stunden.
-- Pro Notiz höchstens ein Hinweis; mehrere gleichzeitig fällige ergeben einen gemeinsamen Hinweis.

-- ---------- Einstellungen ----------
alter table public.user_settings
  add column if not exists followup_enabled boolean not null default true,
  add column if not exists followup_hours   int     not null default 5 check (followup_hours between 1 and 24),
  add column if not exists evening_from     time    not null default '18:00',
  add column if not exists morning_at       time    not null default '08:00';

do $$
begin
  alter table public.user_settings add constraint user_settings_evening_after_morning check (evening_from > morning_at);
exception when duplicate_object then null;
end $$;

-- Eine unbekannte Zeitzone (z. B. 'Etc/Unknown' aus manchen Browsern) wird beim Speichern durch Europe/Berlin ersetzt.
-- Speichern schlägt dadurch nie fehl, und der Server rechnet nie mit einer ungültigen Zone.
create or replace function public.user_settings_normalize_tz() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    new.timezone := 'Europe/Berlin';
  end if;
  return new;
end $$;
drop trigger if exists user_settings_normalize_tz on public.user_settings;
create trigger user_settings_normalize_tz before insert or update of timezone on public.user_settings
  for each row execute function public.user_settings_normalize_tz();

-- ---------- Notizen ----------
alter table public.notes
  add column if not exists followup_at timestamptz,
  add column if not exists followup_sent_at timestamptz;
create index if not exists notes_followup_idx on public.notes (followup_at)
  where followup_sent_at is null and status = 'open';

-- Neue Zeit für eine Notiz (Später, Bearbeiten, Wieder öffnen) → alle Merker zurücksetzen.
create or replace function public.notes_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.remind_at is distinct from old.remind_at then
    new.sent_at := null;
    new.followup_at := null;
    new.followup_sent_at := null;
    new.action_token := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end $$;

-- ---------- Zeitregel (rein, ohne Tabellenzugriff) ----------
create or replace function public.followup_time(p_now timestamptz, p_tz text, p_evening time, p_morning time, p_hours int)
returns timestamptz language plpgsql stable set search_path = '' as $$
declare
  local_ts timestamp := p_now at time zone p_tz;
  local_t  time := local_ts::time;
  local_d  date := local_ts::date;
  due      timestamptz;
  due_ts   timestamp;
begin
  if local_t >= p_evening then
    return ((local_d + 1) + p_morning) at time zone p_tz;
  elsif local_t < p_morning then
    return (local_d + p_morning) at time zone p_tz;
  end if;
  due := p_now + make_interval(hours => p_hours);
  due_ts := due at time zone p_tz;
  -- Landet "+ Stunden" in der Nacht (nach Mitternacht, vor morning_at), kommt der Hinweis stattdessen morgens.
  if due_ts::time < p_morning then
    return (due_ts::date + p_morning) at time zone p_tz;
  end if;
  return due;
end $$;

-- Nachfass-Zeitpunkt für einen Nutzer nach seinen Einstellungen (ohne Zeile: Vorgaben; ausgeschaltet: null).
create or replace function public.followup_for_user(p_user uuid, p_now timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select followup_enabled, followup_hours, evening_from, morning_at, timezone into s
    from public.user_settings where user_id = p_user;
  if not found then
    return public.followup_time(p_now, 'Europe/Berlin', '18:00', '08:00', 5);
  end if;
  if not s.followup_enabled then return null; end if;
  begin
    return public.followup_time(p_now, s.timezone, s.evening_from, s.morning_at, s.followup_hours);
  exception when others then
    -- z. B. unbekannte Zeitzone im Altbestand: Vorgaben-Zone nehmen, damit nie alle Erinnerungen blockiert werden
    return public.followup_time(p_now, 'Europe/Berlin', s.evening_from, s.morning_at, s.followup_hours);
  end;
end $$;

-- ---------- Fällige Erinnerungen beanspruchen (setzt jetzt zusätzlich followup_at) ----------
create or replace function public.claim_due_notes() returns setof public.notes
language sql security definer set search_path = public as $$
  update public.notes n
     set sent_at = now(), followup_at = public.followup_for_user(n.user_id, now())
   where n.id in (
     select id from public.notes
      where status = 'open' and sent_at is null and remind_at <= now()
        for update skip locked
   )
  returning n.*;
$$;

-- ---------- Fällige Nachfass-Hinweise beanspruchen ----------
-- Eine Zeile pro Nutzer. open_count = alles, was die App unter "Fällig" zeigt.
-- Markiert nur die Notizen, deren eigener Zeitpunkt fällig war (die anderen behalten ihren).
create or replace function public.claim_due_followups() returns table (user_id uuid, open_count int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with due as (
    update public.notes n set followup_sent_at = now()
     where n.id in (
       select x.id from public.notes x
         left join public.user_settings s on s.user_id = x.user_id
        where x.status = 'open' and x.followup_at <= now() and x.followup_sent_at is null
          and coalesce(s.followup_enabled, true)
          for update of x skip locked
     )
    returning n.user_id as uid
  )
  select d.uid, (select count(*)::int from public.notes o
                  where o.user_id = d.uid and o.status = 'open' and o.remind_at <= now())
    from (select distinct due.uid from due) d;
end $$;

-- ---------- Rechte: nur der Server ----------
revoke all on function public.followup_time(timestamptz, text, time, time, int) from public, anon, authenticated;
revoke all on function public.followup_for_user(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_due_notes() from public, anon, authenticated;
revoke all on function public.claim_due_followups() from public, anon, authenticated;
grant execute on function public.followup_time(timestamptz, text, time, time, int) to service_role;
grant execute on function public.followup_for_user(uuid, timestamptz) to service_role;
grant execute on function public.claim_due_notes() to service_role;
grant execute on function public.claim_due_followups() to service_role;

-- ===== 005_ai_usage.sql =====

-- Tageslimit für die Claude-Funktion (parse-note): schützt vor Kosten bei Missbrauch.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);
-- RLS an und bewusst ohne Policies: nur der Server (service_role) darf zugreifen.
alter table public.ai_usage enable row level security;

-- Zählt einen Aufruf atomar hoch; true, solange das Limit nicht überschritten ist.
create or replace function public.ai_usage_hit(p_user uuid, p_limit int, p_day date default current_date)
returns boolean language sql security definer set search_path = '' as $$
  insert into public.ai_usage as u (user_id, day, count) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count <= p_limit;
$$;
revoke all on function public.ai_usage_hit(uuid, int, date) from public, anon, authenticated;
grant execute on function public.ai_usage_hit(uuid, int, date) to service_role;
