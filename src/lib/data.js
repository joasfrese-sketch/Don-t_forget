// Datenzugriff auf Supabase: Einstellungen, Notizen, Realtime.
import { supabase, unwrap } from './supabase.js';

export const DEFAULTS = { default_time: '17:00', timezone: 'Europe/Berlin' };

async function uid() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Nicht angemeldet');
  return data.user.id;
}

const normSettings = (s) => ({ default_time: String(s.default_time).slice(0, 5), timezone: s.timezone });

export async function getSettings() {
  const user_id = await uid();
  const row = unwrap(await supabase.from('user_settings').select('default_time, timezone').eq('user_id', user_id).maybeSingle());
  if (row) return normSettings(row);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULTS.timezone;
  const created = unwrap(await supabase.from('user_settings')
    .upsert({ user_id, default_time: DEFAULTS.default_time, timezone }).select('default_time, timezone').single());
  return normSettings(created);
}

export async function saveSettings({ default_time, timezone }) {
  const user_id = await uid();
  unwrap(await supabase.from('user_settings').upsert({ user_id, default_time, timezone }));
}

export async function listNotes() {
  return unwrap(await supabase.from('notes').select('*').order('remind_at'));
}

export async function createNote(text, remindAt, customTime) {
  return unwrap(await supabase.from('notes')
    .insert({ text: text.trim(), remind_at: remindAt.toISOString(), custom_time: customTime }).select().single());
}

export async function updateNote(id, patch) {
  return unwrap(await supabase.from('notes').update(patch).eq('id', id).select().single());
}

export const markDone = (id) => updateNote(id, { status: 'done' });
export const reopen = (id, remindAt) => updateNote(id, { status: 'open', remind_at: remindAt.toISOString() });
export const snooze = (id) => updateNote(id, { remind_at: new Date(Date.now() + 3600e3).toISOString() });

export async function deleteNote(id) {
  unwrap(await supabase.from('notes').delete().eq('id', id));
}

export async function subscribeNotes(onChange) {
  const user_id = await uid();
  const ch = supabase.channel('notes-' + user_id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${user_id}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
