// Kleine Prüfungen für die Kontoansicht.
export function validateNewPassword(pw) {
  return String(pw ?? '').length < 6 ? 'Mindestens 6 Zeichen.' : null;
}
