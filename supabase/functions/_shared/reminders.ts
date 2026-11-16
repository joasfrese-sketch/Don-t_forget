// Reine Helfer für die Edge Functions (ohne Deno-/npm-Imports, damit Vitest sie laden kann).

export type Action = 'done' | 'snooze';
const MAX = 180;

export function buildPayload(note: { id: string; text: string; action_token: string }): string {
  const body = note.text.length > MAX ? note.text.slice(0, MAX - 1) + '…' : note.text;
  return JSON.stringify({ title: "Don't forget", body, noteId: note.id, token: note.action_token, url: '/#/n/' + note.id });
}

export function parseAction(body: unknown): { id: string; token: string; action: Action } | null {
  if (!body || typeof body !== 'object') return null;
  const { id, token, action } = body as Record<string, unknown>;
  if (typeof id !== 'string' || !id || typeof token !== 'string' || !token) return null;
  if (action !== 'done' && action !== 'snooze') return null;
  return { id, token, action };
}
