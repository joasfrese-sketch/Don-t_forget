// Edge Function: macht aus Text (getippt, diktiert oder gesprochen) Erinnerungen – mit Claude Haiku.
// Nur für angemeldete Nutzer (verify_jwt = true), höchstens 50 Aufrufe pro Nutzer und Tag.
// Der Schlüssel steht als Function-Secret ANTHROPIC_API_KEY (vom Nutzer im Dashboard eingetragen).
// Deploy: supabase functions deploy parse-note
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { TOOL, buildSystemPrompt, describeNow, extractToolInput, validateParsed, validateRequest } from '../_shared/parse.ts';

const MODEL = 'claude-haiku-5-5';
const DAILY_LIMIT = 50;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'invalid' });

  let input = null;
  try { input = validateRequest(await req.json()); } catch { /* ungültiges JSON */ }
  if (!input) return reply(400, { error: 'invalid' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Nutzer aus dem JWT (die Plattform hat die Signatur schon geprüft)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth?.user) return reply(401, { error: 'invalid' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return reply(503, { error: 'not_configured' });

  // Limit zählt erst, wenn die Funktion eingerichtet ist (Aufrufe ohne Schlüssel verbrauchen nichts)
  const { data: allowed, error: usageError } = await admin.rpc('ai_usage_hit', { p_user: auth.user.id, p_limit: DAILY_LIMIT });
  if (usageError) return reply(502, { error: 'unavailable' });
  if (allowed !== true) return reply(429, { error: 'limit' });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(describeNow(input.now, input.timezone), input.defaultTime),
        messages: [{ role: 'user', content: input.text }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
      }),
    });
    if (!res.ok) {
      console.error('anthropic', res.status, (await res.text()).slice(0, 300));
      return reply(502, { error: 'unavailable' });
    }
    return reply(200, { notes: validateParsed(extractToolInput(await res.json())) });
  } catch (e) {
    console.error('parse-note', e);
    return reply(502, { error: 'unavailable' });
  }
});
