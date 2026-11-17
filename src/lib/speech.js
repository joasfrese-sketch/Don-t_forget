// Spracherkennung des Browsers (Chrome/Edge). Auf manchen Geräten (z. B. installierte iPad-App) nicht verfügbar.
const ctor = () => window.SpeechRecognition || window.webkitSpeechRecognition;

// In der Windows-App (Electron) gibt es keine Spracherkennung, auch wenn das Objekt vorhanden ist.
export const speechSupported = () => !window.dtfDesktop && !!ctor();

export function speechErrorMessage(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Mikrofon nicht erlaubt.';
  if (code === 'no-speech') return 'Ich habe nichts gehört.';
  if (code === 'aborted') return '';
  return 'Spracherkennung hat nicht geklappt.';
}

// onText bekommt den bisher erkannten Gesamttext (auch Zwischenstände); onEnd kommt immer am Schluss.
export function startListening({ onText, onEnd, onError }) {
  const rec = new (ctor())();
  rec.lang = 'de-DE';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    onText(text.trim());
  };
  rec.onerror = (e) => onError(e.error);
  rec.onend = () => onEnd();
  try {
    rec.start();
  } catch {
    // z. B. installierte iPad-App: Konstruktor vorhanden, aber nicht nutzbar → sofort Fehler und Ende melden
    onError('start-failed');
    onEnd();
    return { stop() {} };
  }
  return { stop: () => rec.stop() };
}
