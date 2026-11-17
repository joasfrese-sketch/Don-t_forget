'use strict';
// Dateien im Benutzerordner der Windows-App: Lesen mit Ersatzwert, Schreiben atomar (erst Zwischendatei, dann umbenennen).
const fs = require('node:fs');
const path = require('node:path');

function readJson(file, fallback, fsImpl = fs) {
  try { return JSON.parse(fsImpl.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Ein Absturz oder Stromausfall mitten im Schreiben darf die vorhandene Datei nie halb überschreiben.
function writeJsonAtomic(file, value, fsImpl = fs) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fsImpl.mkdirSync(path.dirname(file), { recursive: true });
    fsImpl.writeFileSync(tmp, JSON.stringify(value));
    fsImpl.renameSync(tmp, file);
  } catch {
    try { fsImpl.rmSync(tmp, { force: true }); } catch { /* ignorieren */ }
  }
}

module.exports = { readJson, writeJsonAtomic };
