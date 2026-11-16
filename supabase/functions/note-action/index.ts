// Edge Function: Knöpfe „Erledigt“/„Später“ aus der Push-Nachricht.
// Der Service Worker hat keine Anmeldung; das action_token der Notiz dient als Berechtigung.
// Deploy: supabase functions deploy note-action --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseAction } from '../_shared/reminders.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
  let parsed = null;
  try { parsed = parseAction(await req.json()); } catch { /* ungültiges JSON */ }
  if (!parsed) return Response.json({ ok: false }, { status: 400, headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('note_action', { p_id: parsed.id, p_token: parsed.token, p_action: parsed.action });
  if (error) return Response.json({ ok: false }, { status: 400, headers: cors });
  return Response.json({ ok: data === true }, { headers: cors });
});
