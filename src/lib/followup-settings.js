// Prüfung der Nachfass-Einstellungen (gleiche Regeln wie in der Datenbank).
export function validateFollowup({ followup_hours, evening_from, morning_at }) {
  if (!Number.isInteger(followup_hours) || followup_hours < 1 || followup_hours > 24) return 'Stunden: 1 bis 24.';
  if (!evening_from || !morning_at || evening_from <= morning_at) return 'Abend muss nach dem Morgen liegen.';
  return null;
}
