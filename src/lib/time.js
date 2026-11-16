// Reine Zeitlogik: alles in der Zeitzone des Nutzers, ohne Bibliothek.

const fmtCache = new Map();
function fmt(timeZone) {
  if (!fmtCache.has(timeZone)) {
    fmtCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }));
  }
  return fmtCache.get(timeZone);
}

// Ortszeit-Bestandteile eines Zeitpunkts
function parts(d, timeZone) {
  const o = {};
  for (const p of fmt(timeZone).formatToParts(d)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute, s: +o.second, wd: o.weekday };
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;

// Offset der Zone (ms) zu einem Zeitpunkt: Ortszeit als UTC gelesen minus echter Zeitpunkt
function offset(d, timeZone) {
  const p = parts(d, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - (d.getTime() - d.getUTCMilliseconds());
}

export function zonedToUtc(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - offset(new Date(guess), timeZone);
  t = guess - offset(new Date(t), timeZone); // Korrektur rund um die Zeitumstellung
  return new Date(t);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

export function defaultRemindAt(now, defaultTime, timeZone) {
  const today = ymd(parts(now, timeZone));
  const t = zonedToUtc(today, defaultTime, timeZone);
  return t > now ? t : zonedToUtc(addDays(today, 1), defaultTime, timeZone);
}

export function toLocalInputValue(d, timeZone) {
  const p = parts(d, timeZone);
  return `${ymd(p)}T${pad(p.h)}:${pad(p.min)}`;
}

const WD = { Mon: 'Mo', Tue: 'Di', Wed: 'Mi', Thu: 'Do', Fri: 'Fr', Sat: 'Sa', Sun: 'So' };

export function formatWhen(d, now, timeZone) {
  const p = parts(d, timeZone);
  const day = ymd(p);
  const today = ymd(parts(now, timeZone));
  const time = `${pad(p.h)}:${pad(p.min)}`;
  if (day === today) return `heute ${time}`;
  if (day === addDays(today, 1)) return `morgen ${time}`;
  if (day === addDays(today, -1)) return `gestern ${time}`;
  return `${WD[p.wd]} ${pad(p.d)}.${pad(p.m)}. ${time}`;
}

// Zeitpunkt des Nachfass-Hinweises für eine Erinnerung, die um `now` kommt (Ortszeit der Zone `tz`):
// ab `eveningFrom` → nächster Morgen `morningAt`; vor `morningAt` (Nacht) → am selben Morgen;
// sonst `hours` Stunden später – landet das nach Mitternacht vor `morningAt`, dann `morningAt`.
export function followupTime(now, tz, eveningFrom, morningAt, hours) {
  const hhmm = (p) => `${pad(p.h)}:${pad(p.min)}`;
  const p = parts(now, tz);
  const today = ymd(p);
  if (hhmm(p) >= eveningFrom) return zonedToUtc(addDays(today, 1), morningAt, tz);
  if (hhmm(p) < morningAt) return zonedToUtc(today, morningAt, tz);
  const due = new Date(now.getTime() + hours * 3600e3);
  const dp = parts(due, tz);
  if (hhmm(dp) < morningAt) return zonedToUtc(ymd(dp), morningAt, tz);
  return due;
}
