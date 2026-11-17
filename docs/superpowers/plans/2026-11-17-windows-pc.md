# Don't forget – Windows-PC-App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Auftrag des Nutzers (2026-11-17):** Als Nächstes den Windows-PC. Das Repository ist privat. Stehender Auftrag: Vorschläge werden direkt umgesetzt. Weiter gilt: lokal, kein Server, nichts wird veröffentlicht, jedes Gerät hat eigene Daten.

**Spec:** Dieses Dokument. Frühere Dokumente (`2026-11-16-lokal-app.md`) gelten für Regeln, Oberfläche und Zeitlogik.

## Entscheidungen (meine, begründet)

1. **Electron-Hülle** um denselben Web-Code. Eine Codebasis für Android und PC.
2. **Erinnerungen:** Windows kann einer normalen Desktop-App keine Alarme für später im Betriebssystem anmelden. Deshalb läuft die App **im Hintergrund im Infobereich (Tray)**. Beim Schließen des Fensters bleibt sie laufen. Beenden geht nur über das Tray-Menü. Optional **Start mit Windows** (in den Einstellungen, beim ersten Start an, mit klarem Hinweis).
3. **Planung:** Dieselbe Planung wie bei Android (`planNotifications`). Der Hauptprozess bekommt die Liste und prüft alle **5 Sekunden**, was fällig ist (robust gegen Ruhezustand). Verpasste Erinnerungen der letzten **6 Stunden** (PC war aus oder im Ruhezustand) kommen nach dem Aufwachen einmal nach, ältere werden still verworfen. Was schon angezeigt wurde, wird nicht erneut angezeigt (gemerkt in einer Datei im Benutzerordner).
4. **Antippen/Klick** auf die Windows-Nachricht öffnet die App bei der Notiz (Hauptansicht bei Sammelhinweisen). Knöpfe „Erledigt/Später“ in der Windows-Nachricht gibt es nicht (Electron kann das unter Windows nicht einfach), sie stehen im Bearbeiten-Dialog.
5. **Sicherheit:** `contextIsolation`, kein Node im Fenster, Sandbox, eigenes Schema `dtf://app/` mit Schutz gegen Pfadtricks, Navigation und neue Fenster gesperrt. Das Fenster darf über den Hauptprozess **nur** `https://api.anthropic.com/` aufrufen (für Claude).
6. **Spracheingabe 🎤** entfällt auf dem PC (Chromium in Electron hat keine Spracherkennung). Windows hat Diktieren (Windows-Taste + H), danach ✨.
7. **Bau:** GitHub Actions auf `windows-latest`, Ergebnis ist **`Dont-forget-Setup.exe`** (Installer für den aktuellen Benutzer, ohne Administrator, nicht signiert → Windows SmartScreen warnt einmalig: „Weitere Informationen → Trotzdem ausführen“).
8. **Test:** Der Desktop-Hauptprozess wird hier unter Linux mit echtem Electron (xvfb) per Playwright gestartet und geprüft (Fenster lädt, Speicher bleibt, Planung → Nachricht, Tray/Schließen, Einzelinstanz). Windows-spezifisch (Toast-Darstellung, Installer, Autostart-Eintrag) ist hier nicht prüfbar.

## Global Constraints

- Oberfläche Deutsch, Titel der Nachrichten `Don't forget`. Keine Daten verlassen den PC außer dem Claude-Aufruf.
- Die App-Kennung bleibt `de.dontforget.app` (auch AppUserModelID für Windows-Nachrichten).
- Keine Veröffentlichung: nur Artifact im privaten Repository.

## Review Focus

1. Verpasste Erinnerungen nach Ruhezustand: einmal nachholen, nie doppelt, nie älter als 6 Stunden.
2. Nach „Erledigt/Verschieben/Löschen“ in der App dürfen keine alten Erinnerungen mehr auf dem PC erscheinen (Plan wird ersetzt).
3. Schließen des Fensters beendet die App nicht; zweiter Start öffnet nur das vorhandene Fenster.
4. Pfadtricks beim eigenen Schema (`../`, `%2e%2e`, Backslashes) liefern nichts außerhalb des App-Ordners.
5. Der Claude-Weg erlaubt nur `https://api.anthropic.com/`.
6. Beschädigte „schon angezeigt“-Datei: kein Absturz.

---

### Task 1: Reine Desktop-Logik

**Files:** Create `desktop/scheduler.cjs`, `desktop/paths.cjs`, `tests/desktop-scheduler.test.js`, `tests/desktop-paths.test.js`.

- `scheduler.cjs`: `createScheduler({ now, show, loadShown, saveShown, catchUpMs = 6*3600e3 })` → `{ set(list), cancelAll(), tick() }`. `list = [{ id, atMs, title, body, kind, noteId }]`. `tick()` zeigt fällige Einträge, die noch nicht angezeigt wurden und höchstens `catchUpMs` zurückliegen, genau einmal (Schlüssel `id@atMs`, gespeichert über `saveShown`), und verwirft ältere still. `set` ersetzt den Plan; Schlüssel ohne Eintrag im Plan werden aus dem Gemerkten entfernt, nur wenn sie älter als `catchUpMs` sind.
- `paths.cjs`: `resolveAppPath(distDir, urlPathname): string | null` (nur Dateien unterhalb von `distDir`, `/` → `index.html`, kein `..`, kein `%2e`, keine Backslashes, keine NUL-Zeichen), `isAllowedFetchUrl(url): boolean` (nur `https://api.anthropic.com/…`, kein Benutzername/Passwort, kein anderer Host, kein `http`).
- [ ] Tests zuerst (rot), dann implementieren, grün, Commit.

### Task 2: Brücke im Fenster (Plattform, Claude, Einstellungen)

**Files:** Modify `src/lib/notify.js` (`desktopPlatform`, `defaultPlatform`), `src/lib/ai.js` (Standard-Abruf über die Brücke), `src/lib/speech.js` (auf dem PC nicht unterstützt), `src/ui/settings.js` (Abschnitt „Windows“: Start mit Windows), Tests `tests/notify.test.js`, `tests/ai.test.js`, `tests/speech.test.js`, `tests/e2e/smoke.mjs`.

- `window.dtfDesktop` = `{ schedule(list), cancelAll(), onAction(cb), getAutostart(), setAutostart(bool), fetch(url, init) }` (vom Preload). `desktopPlatform(bridge)`: Berechtigung immer `granted`, `schedule` wandelt `at` in `atMs`.
- [ ] Tests zuerst (rot), implementieren, Browser-Test mit künstlicher Brücke, Commit.

### Task 3: Electron-Hülle

**Files:** Create `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/icon.png`, `desktop/icon.ico`, `tests/e2e/desktop.mjs`. Modify `package.json` (`main`, Skripte `desktop`, `dist:win`, `build`-Konfiguration für electron-builder).

- Fenster 480×800, kein Menü, Schema `dtf://app/`, Einzelinstanz, Tray mit „Öffnen“/„Beenden“, Schließen = ins Tray, `--hidden` beim Autostart, `setAppUserModelId('de.dontforget.app')`, IPC (`schedule`, `cancelAll`, `autostart`, `fetch` nur Anthropic), Klick auf Nachricht → Fenster zeigen und Aktion an die Seite.
- Test-Haken: mit Umgebungsvariable `DTF_TEST_LOG=<Datei>` schreibt der Hauptprozess angezeigte Nachrichten als JSON-Zeilen in diese Datei (statt echter Windows-Nachricht) – nur zum Testen.
- [ ] Test `tests/e2e/desktop.mjs` (Playwright `_electron`, xvfb): lädt, speichert Notiz, bleibt nach Neustart, Plan → Nachricht pünktlich (mit kurzer Zeit), kein Doppelt nach Neustart, Fensterschließen beendet nicht, zweiter Start öffnet kein zweites Fenster, `window.dtfDesktop` vorhanden, Navigation zu fremder Adresse gesperrt, `fetch` zu fremdem Host abgelehnt. Rot → implementieren → grün.

### Task 4: Windows-Bau und Anleitung

**Files:** Create `.github/workflows/windows.yml`, `tests/windows-config.test.js`. Modify `README.md`.

- Workflow auf `windows-latest`: Node 22, `npm ci`, Tests, `npm run build`, `npx electron-builder --win nsis --publish never`, Artifact `dont-forget-windows` (`release/Dont-forget-Setup.exe`).
- [ ] Test (YAML und Paket-Konfiguration) rot → grün; README (Installation, SmartScreen, Autostart/Tray, Grenzen); Commit, Push, Lauf prüfen.

### Task 5: Abschluss

- [ ] Gesamtlauf, Review des gesamten Zweigs durch frischen Prüfer, Korrekturen mit Test zuerst, Lauf auf GitHub prüfen, Bericht.
