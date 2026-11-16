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
language plpgsql as $$
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
  create extension if not exists pg_net;
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
