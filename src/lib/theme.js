// Hell/Dunkel: system (Vorgabe) | light | dark – pro Gerät in localStorage.
const MODES = ['system', 'light', 'dark'];
const KEY = 'theme';

export const resolveDark = (mode, systemPrefersDark) => (mode === 'system' ? !!systemPrefersDark : mode === 'dark');

export function readTheme(storage) {
  try {
    const v = storage.getItem(KEY);
    return MODES.includes(v) ? v : 'system';
  } catch { return 'system'; }
}

export function saveTheme(mode, storage) {
  try { storage.setItem(KEY, mode); } catch { /* Speicher blockiert: Wahl gilt nur bis zum Neuladen */ }
}

export function applyTheme(mode, root, systemPrefersDark) {
  root.classList.toggle('dark', resolveDark(mode, systemPrefersDark));
}

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

export function setTheme(mode) {
  saveTheme(mode, localStorage);
  applyTheme(mode, document.documentElement, mq().matches);
}

export function initTheme() {
  const apply = () => applyTheme(readTheme(localStorage), document.documentElement, mq().matches);
  apply();
  mq().addEventListener?.('change', apply); // bei „System“ live mitgehen
}
