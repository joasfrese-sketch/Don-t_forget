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
