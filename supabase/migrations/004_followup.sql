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
begin
  if local_t >= p_evening then
    return ((local_d + 1) + p_morning) at time zone p_tz;
  elsif local_t < p_morning then
    return (local_d + p_morning) at time zone p_tz;
  end if;
  return p_now + make_interval(hours => p_hours);
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
  return public.followup_time(p_now, s.timezone, s.evening_from, s.morning_at, s.followup_hours);
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
