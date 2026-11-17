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
  if (decoded.split('/').some((segment) => segment === '..')) return null;
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

module.exports = { resolveAppPath, isAllowedFetchUrl };
