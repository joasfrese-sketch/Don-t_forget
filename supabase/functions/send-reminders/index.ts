// Edge Function: verschickt fällige Erinnerungen per Web-Push.
// Aufruf jede Minute per pg_cron (siehe 001_schema.sql) mit Header x-cron-secret.
// Schlüssel kommen aus dem Vault (public.app_secret) oder, falls gesetzt, aus Function-Secrets.
// Deploy: supabase functions deploy send-reminders --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { buildPayload } from '../_shared/reminders.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cache = new Map<string, string>();
async function secret(name: string): Promise<string> {
  const env = Deno.env.get(name.toUpperCase());
  if (env) return env;
  if (!cache.has(name)) {
    const { data, error } = await admin.rpc('app_secret', { p_name: name });
    if (error || !data) throw new Error('Secret fehlt: ' + name);
    cache.set(name, data as string);
  }
  return cache.get(name)!;
}

Deno.serve(async (req) => {
  const cronSecret = await secret('cron_secret').catch(() => null);
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return new Response('forbidden', { status: 403 });

  // Schlüssel vor dem Beanspruchen laden, damit bei fehlender Konfiguration keine Erinnerung verloren geht
  webpush.setVapidDetails(await secret('vapid_subject'), await secret('vapid_public_key'), await secret('vapid_private_key'));
  const { data: notes, error } = await admin.rpc('claim_due_notes');
  if (error) return new Response(error.message, { status: 500 });
  if (!notes?.length) return Response.json({ claimed: 0, sent: 0 });

  const userIds = [...new Set(notes.map((n: { user_id: string }) => n.user_id))];
  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds);

  let sent = 0;
  for (const note of notes) {
    const payload = buildPayload(note);
    for (const sub of (subs ?? []).filter((s) => s.user_id === note.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (e: any) {
        if (e.statusCode === 404 || e.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id);
        else console.error('push failed', e.statusCode, e.body);
      }
    }
  }
  return Response.json({ claimed: notes.length, sent });
});
