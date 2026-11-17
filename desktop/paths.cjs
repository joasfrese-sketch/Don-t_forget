'use strict';
// Sicherheits-Helfer für den Windows-Hauptprozess (rein, ohne Electron, getestet).
const path = require('node:path');

// Übersetzt den Pfad einer Anfrage an dtf://app/… in eine Datei unterhalb von distDir – oder null, wenn der Pfad nicht passt.
function resolveAppPath(distDir, urlPathname) {
  if (typeof urlPathname !== 'string') return null;
  const raw = urlPathname === '' || urlPathname === '/' ? '/index.html' : urlPathname;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (decoded.includes(':')) return null; // Laufwerksbuchstaben und Alternative Datenströme (Windows)
  if (/[*?"<>|]/.test(decoded)) return null; // in Windows-Dateinamen verboten
  // Windows schneidet Punkte und Leerzeichen am Namensende ab: ".. " wäre ".." – die App hat nie solche Namen
  if (decoded.split('/').slice(1).some((segment) => segment === '..' || /[. ]$/.test(segment))) return null;
  const full = path.join(distDir, decoded);
  const rel = path.relative(distDir, full);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return full;
}

// Das Fenster darf über den Hauptprozess nur die Anthropic-API aufrufen.
function isAllowedFetchUrl(url) {
  if (typeof url !== 'string') return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === 'https:' && u.hostname === 'api.anthropic.com' && u.port === '' && u.username === '' && u.password === '';
}

const MAX_BODY = 100_000;
// Nur diese Kopfzeilen braucht der Claude-Aufruf (Groß-/Kleinschreibung egal); alles andere wird verworfen.
const ALLOWED_HEADERS = new Set(['x-api-key', 'anthropic-version', 'anthropic-beta', 'anthropic-dangerous-direct-browser-access', 'content-type', 'accept']);

// Bereinigt die Optionen des Claude-Aufrufs aus dem Fenster: immer POST, keine Weiterleitungen (der Schlüssel darf nirgends
// anders hin), nur die benötigten Kopfzeilen (Allow-List), Körper nur als Text.
function sanitizeFetchInit(init) {
  const src = init && typeof init === 'object' ? init : {};
  const headers = {};
  if (src.headers && typeof src.headers === 'object' && !Array.isArray(src.headers)) {
    for (const [name, value] of Object.entries(src.headers)) {
      if (typeof value !== 'string' || !ALLOWED_HEADERS.has(name.toLowerCase())) continue;
      if (/[\r\n\0]/.test(value)) continue;
      headers[name] = value;
    }
  }
  const body = typeof src.body === 'string' && src.body.length <= MAX_BODY ? src.body : undefined;
  return { method: 'POST', headers, body, redirect: 'error' };
}

module.exports = { resolveAppPath, isAllowedFetchUrl, sanitizeFetchInit };
