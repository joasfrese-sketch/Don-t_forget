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
