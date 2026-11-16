// Reine Helfer für die Edge Function parse-note (ohne Deno-/npm-Imports, damit Vitest sie laden kann).

export type ParsedNote = { text: string; date: string | null; time: string | null };

const MAX_NOTES = 10;
const MAX_TEXT = 200;
const MAX_INPUT = 1000;

// Das einzige Werkzeug, das Claude aufrufen darf: erzwingt eine strukturierte Antwort.
export const TOOL = {
  name: 'create_notes' as const,
  description: 'Legt eine oder mehrere Erinnerungen an. Pro Termin ein Eintrag.',
  input_schema: {
    type: 'object',
    properties: {
      notes: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_NOTES,
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Kurzer Text der Erinnerung, im Wortlaut des Nutzers.' },
            date: { type: ['string', 'null'], description: 'Datum als YYYY-MM-DD in der Ortszeit des Nutzers, sonst null.' },
            time: { type: ['string', 'null'], description: 'Uhrzeit als HH:MM (24 Stunden) in der Ortszeit des Nutzers, nur wenn genannt, sonst null.' },
          },
          required: ['text', 'date', 'time'],
        },
      },
    },
    required: ['notes'],
  },
};

export function describeNow(nowIso: string, timezone: string): string {
  const d = new Date(nowIso);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('de-DE', { timeZone: timezone, ...o }).format(d);
  const weekday = part({ weekday: 'long' });
  const date = part({ day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = part({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${weekday}, ${date}, ${time} Uhr (${timezone})`;
}

export function buildSystemPrompt(nowDescription: string, defaultTime: string): string {
  return [
    'Du hilfst in einer Erinnerungs-App. Der Nutzer diktiert oder tippt, was er nicht vergessen will. Mache daraus Erinnerungen über das Werkzeug create_notes.',
    `Jetzt ist: ${nowDescription}. Rechne relative Angaben („morgen“, „Freitag“, „in zwei Stunden“, „nächste Woche Montag“) in konkrete Daten der Ortszeit um.`,
    'Regeln:',
    '- Ein Eintrag pro Termin. Nenne mehrere Dinge, mache mehrere Einträge.',
    '- Der Text bleibt kurz und im Wortlaut des Nutzers, ohne Datum und Uhrzeit darin.',
    '- Nur wenn eine Uhrzeit genannt wird, setze time. Ohne genannte Uhrzeit: keine Uhrzeit raten, time = null.',
    `- Ohne genannten Tag: date = null. Die Standard-Erinnerungszeit des Nutzers ist ${defaultTime} und wird von der App verwendet, setze sie nicht selbst.`,
    '- „Abends“, „morgens“ usw. ohne genaue Zeit: time = null.',
  ].join('\n');
}

export function extractToolInput(apiResponse: unknown): unknown {
  const content = (apiResponse as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return null;
  const block = content.find((b) => b && b.type === 'tool_use' && b.name === TOOL.name);
  return block ? block.input ?? null : null;
}

const isRealDate = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const isTime = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function validateParsed(raw: unknown): ParsedNote[] {
  const list = (raw as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(list)) return [];
  const out: ParsedNote[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { text, date, time } = item as Record<string, unknown>;
    const t = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : '';
    if (!t) continue;
    out.push({
      text: t,
      date: typeof date === 'string' && isRealDate(date) ? date : null,
      time: typeof time === 'string' && isTime(time) ? time : null,
    });
    if (out.length === MAX_NOTES) break;
  }
  return out;
}

export function validateRequest(body: unknown): { text: string; now: string; timezone: string; defaultTime: string } | null {
  if (!body || typeof body !== 'object') return null;
  const { text, now, timezone, defaultTime } = body as Record<string, unknown>;
  if (typeof text !== 'string' || typeof now !== 'string' || typeof timezone !== 'string' || typeof defaultTime !== 'string') return null;
  const t = text.trim();
  if (!t || t.length > MAX_INPUT) return null;
  if (Number.isNaN(new Date(now).getTime())) return null;
  try { new Intl.DateTimeFormat('de-DE', { timeZone: timezone }); } catch { return null; }
  if (!isTime(defaultTime)) return null;
  return { text: t, now, timezone, defaultTime };
}
