// Macht aus dem Ergebnis von Claude ({ text, date, time }) konkrete Erinnerungen.
// Datum und Uhrzeit rechnet die App (getestet), nicht das Modell.
import { zonedToUtc, defaultRemindAt } from './time.js';

const addDay = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

export function resolveParsed(notes, now, settings) {
  const { default_time: defTime, timezone: tz } = settings;
  const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); // YYYY-MM-DD

  return notes.map(({ text, date, time }) => {
    const fallback = () => ({ text, remindAt: defaultRemindAt(now, defTime, tz), custom: false });
    let r;
    if (date && time) r = { text, remindAt: zonedToUtc(date, time, tz), custom: true };
    else if (date) r = { text, remindAt: zonedToUtc(date, defTime, tz), custom: true };
    else if (time) {
      let at = zonedToUtc(todayLocal(), time, tz);
      if (at <= now) at = zonedToUtc(addDay(todayLocal()), time, tz); // morgen, gleiche Ortszeit (auch über die Zeitumstellung)
      r = { text, remindAt: at, custom: true };
    } else return { ...fallback(), adjusted: false };

    if (r.remindAt > now) return { ...r, adjusted: false };
    return { ...fallback(), adjusted: true }; // Vergangenheit → nächste Standardzeit, in der Vorschau markiert
  });
}
