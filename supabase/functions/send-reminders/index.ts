// Edge Function: verschickt fällige Erinnerungen und gemeinsame Nachfass-Hinweise per Web-Push.
// Aufruf jede Minute per pg_cron (siehe 001_schema.sql) mit Header x-cron-secret.
// Schlüssel kommen aus dem Vault (public.app_secret) oder, falls gesetzt, aus Function-Secrets.
// Deploy: supabase functions deploy send-reminders --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { buildPayload, buildDigestPayload } from '../_shared/reminders.ts';

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

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

// Schickt eine Nachricht an alle Geräte des Nutzers; abgelaufene Abos werden gelöscht. Liefert die Zahl erfolgreicher Sendungen.
async function pushTo(subs: Sub[], payload: string, urgency: 'high' | 'normal'): Promise<number> {
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency });
      sent++;
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id);
      else console.error('push failed', e.statusCode, e.body);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  const cronSecret = await secret('cron_secret').catch(() => null);
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return new Response('forbidden', { status: 403 });

  // Schlüssel vor dem Beanspruchen laden, damit bei fehlender Konfiguration keine Erinnerung verloren geht
  webpush.setVapidDetails(await secret('vapid_subject'), await secret('vapid_public_key'), await secret('vapid_private_key'));

  const { data: notes, error } = await admin.rpc('claim_due_notes');
  if (error) return new Response(error.message, { status: 500 });
  // Nachfassen nach den normalen Erinnerungen; ein Fehler hier darf die Erinnerungen nicht blockieren
  const { data: digests, error: digestError } = await admin.rpc('claim_due_followups');
  if (digestError) console.error('claim_due_followups', digestError.message);

  const due = (notes ?? []) as { user_id: string; id: string; text: string; action_token: string }[];
  const followups = (digests ?? []) as { user_id: string; open_count: number }[];
  if (!due.length && !followups.length) return Response.json({ claimed: 0, sent: 0, followups: 0 });

  const userIds = [...new Set([...due.map((n) => n.user_id), ...followups.map((f) => f.user_id)])];
  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds);
  const subsOf = (userId: string) => ((subs ?? []) as Sub[]).filter((s) => s.user_id === userId);

  let sent = 0;
  for (const note of due) sent += await pushTo(subsOf(note.user_id), buildPayload(note), 'high');

  let followupsSent = 0;
  for (const f of followups) followupsSent += await pushTo(subsOf(f.user_id), buildDigestPayload(f.open_count), 'normal');

  return Response.json({ claimed: due.length, sent, followups: followupsSent });
});
