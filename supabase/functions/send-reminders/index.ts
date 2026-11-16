// Edge Function: verschickt fällige Erinnerungen per Web-Push.
// Aufruf jede Minute per pg_cron (siehe 001_schema.sql) mit Header x-cron-secret.
// Deploy: supabase functions deploy send-reminders --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { buildPayload } from '../_shared/reminders.ts';

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: notes, error } = await admin.rpc('claim_due_notes');
  if (error) return new Response(error.message, { status: 500 });
  if (!notes?.length) return Response.json({ claimed: 0, sent: 0 });

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
  const userIds = [...new Set(notes.map((n: { user_id: string }) => n.user_id))];
  const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', userIds);

  let sent = 0;
  for (const note of notes) {
    const payload = buildPayload(note);
    for (const sub of (subs ?? []).filter((s) => s.user_id === note.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id);
        else console.error('push failed', e.statusCode, e.body);
      }
    }
  }
  return Response.json({ claimed: notes.length, sent });
});
