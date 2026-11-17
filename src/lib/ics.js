// Kalender-Export: offene, künftige Notizen als .ics mit Alarm. Der Kalender des Geräts erinnert auch bei geschlossener App.
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function buildIcs(notes, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dont forget//DE', 'CALSCALE:GREGORIAN'];
  for (const n of notes) {
    const at = new Date(n.remind_at);
    if (n.status === 'done' || !(at > now)) continue;
    lines.push(
      'BEGIN:VEVENT', `UID:${n.id}@dontforget.app`, `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(at)}`, `DTEND:${stamp(new Date(at.getTime() + 15 * 60000))}`,
      `SUMMARY:${esc(n.text)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(n.text)}`, `TRIGGER;VALUE=DATE-TIME:${stamp(at)}`, 'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
