# 🔔 Don't forget

Schlichte Notizen-App zum Erinnern: Gedanken in Sekunden festhalten und zur Standardzeit (z. B. 17:00)
oder zu einer eigenen Uhrzeit per Benachrichtigung erinnert werden, auch auf dem Sperrbildschirm.
Für **Android** und **Windows**.

**Alles bleibt auf dem Gerät.** Es gibt keinen Server, kein Konto, keine Anmeldung und keine Synchronisation.
Jedes Gerät hat seine eigenen Notizen. Nichts wird veröffentlicht.

## Was die App kann

- **Festhalten:** Text eintippen, Enter. Die Erinnerung kommt zur Standardzeit (heute, oder morgen, wenn sie schon vorbei ist).
  Mit „ändern“ gibst du einer Notiz eine eigene Zeit.
- **Erinnern:** Die App meldet die Erinnerungen bei Android als Alarme an. Sie kommen auch bei geschlossener App und nach einem Neustart.
  In der Nachricht stehen **Erledigt** und **Später** (+1 Stunde).
- **Nachfassen:** Eine Erinnerung ist gekommen, aber nicht erledigt? Dann gibt es einen Hinweis, in die App zu schauen:
  tagsüber nach 5 Stunden, bei Erinnerungen ab 18:00 am nächsten Morgen um 8:00, in der Nacht um 8:00 am selben Morgen.
  Mehrere offene ergeben einen gemeinsamen Hinweis (nur die Anzahl, keine Texte). Pro Notiz höchstens ein Hinweis. Alle Werte sind einstellbar.
- **Sprechen 🎤 und ✨:** Aus „Reifen am Freitag um 9 wechseln und morgen den Zahnarzt anrufen“ macht Claude zwei Erinnerungen.
  Du siehst vorher eine Vorschau und bestätigst mit **Speichern**. Dafür brauchst du einen eigenen Claude-Schlüssel (siehe unten).
- **Darstellung:** Hell, Dunkel oder wie das Gerät. Dunkelblau mit Grautönen.

## Installation auf dem Android-Handy

Die App wird nicht in einem Store veröffentlicht. Du installierst die Datei direkt:

1. Im GitHub-Repository **Actions → „Android-App bauen“** öffnen und den neuesten erfolgreichen Lauf anklicken
   (oder **Run workflow**, falls noch keiner da ist).
2. Unten bei **Artifacts** die Datei `dont-forget-debug` herunterladen und entpacken. Darin liegt `app-debug.apk`.
3. Die APK aufs Handy bringen (USB, Cloud-Ordner, E-Mail) und öffnen. Android fragt einmalig, ob die Installation
   aus dieser Quelle erlaubt sein soll: erlauben.
4. App öffnen und **Benachrichtigungen erlauben**.
5. Für pünktliche Erinnerungen in den Einstellungen der App (⚙ → Benachrichtigungen) **„Pünktliche Alarme erlauben“**
   antippen, falls Android danach fragt („Alarme & Erinnerungen“).
6. Damit der Handy-Hersteller die App nicht im Hintergrund bremst: in den Android-Einstellungen für die App
   die **Akku-Optimierung ausschalten** („Nicht optimieren“ bzw. „Unbeschränkt“). Bei manchen Herstellern (Xiaomi, Huawei, Samsung)
   gibt es zusätzlich „Autostart“.

## Installation auf dem Windows-PC

1. Im GitHub-Repository **Actions → „Windows-App bauen“** öffnen und den neuesten grünen Lauf anklicken.
2. Unten bei **Artifacts** `dont-forget-windows` herunterladen und entpacken. Darin liegt `Dont-forget-Setup.exe`.
3. Die Datei starten. Die App wird für deinen Benutzer installiert (kein Administrator nötig) und startet danach.
   Weil der Installer nicht signiert ist, zeigt Windows einmalig **„Der Computer wurde durch Windows geschützt“**:
   auf **Weitere Informationen → Trotzdem ausführen** klicken.
4. Die App läuft danach **im Hintergrund** (Glocken-Symbol unten rechts neben der Uhr, ggf. unter „^“). Das Fenster schließen beendet sie nicht,
   sonst kämen keine Erinnerungen mehr. **Beenden:** Rechtsklick auf das Symbol → „Beenden“.
5. Beim ersten Start richtet sich die App so ein, dass sie **mit Windows startet** (nur im Hintergrund, ohne Fenster). Abschaltbar unter ⚙ → Windows.
6. Damit Windows-Nachrichten sichtbar sind: in den Windows-Einstellungen unter System → Benachrichtigungen „Don't forget“ erlauben und den Fokusassistenten bzw. „Nicht stören“ beachten.

Am PC gilt:
- Erinnerungen kommen nur, **solange die App läuft**. War der PC aus oder im Ruhezustand, kommen verpasste Erinnerungen der letzten **6 Stunden** nach dem Aufwachen einmal nach, ältere werden nicht mehr angezeigt.
- Ein Klick auf die Nachricht öffnet die Notiz. „Erledigt/Später“ stehen im Bearbeiten-Dialog, nicht in der Windows-Nachricht.
- Das Mikrofon 🎤 gibt es am PC nicht. Nutze das Diktieren von Windows (**Windows-Taste + H**) im Eingabefeld und tippe danach auf ✨.
- Deine Notizen liegen nur auf diesem PC (Ordner `%APPDATA%\Don't forget`). Sie werden nicht mit dem Handy abgeglichen.

## Claude-Schlüssel (nur für Sprechen und ✨)

Ohne Schlüssel läuft alles andere. Mikrofon und ✨ melden dann „Claude-Schlüssel fehlt“.

1. Auf [console.anthropic.com](https://console.anthropic.com) einen **API-Schlüssel** anlegen (unabhängig von deinem claude.ai-Abo,
   Abrechnung nach Verbrauch, für kurze Notizen Cent-Beträge).
2. In der App ⚙ → **KI (Claude)** einfügen. Der Schlüssel bleibt nur auf diesem Gerät.

Der gesprochene oder getippte Text geht direkt vom Gerät an Anthropic und wird dort zu Terminen verarbeitet. Sonst verlässt nichts das Gerät.

## Grenzen

- **Kein Abgleich** zwischen Geräten. Notizen gibt es nur auf dem Gerät, auf dem du sie angelegt hast.
- **Deinstallieren löscht die Notizen.** Es gibt keine Sicherung in der Cloud.
- **Das iPad ist nicht dabei.** Erinnerungen bei geschlossener App brauchen dort eine richtige App (Mac oder Cloud-Build und ein Apple-Konto).
- Die Spracherkennung (🎤) hängt vom Gerät ab. Wenn sie fehlt, hilft das Mikrofon der Tastatur und danach ✨.
- Android erlaubt nur begrenzt viele geplante Alarme. Die App plant die nächsten **60** (Erinnerungen und Hinweise);
  bei jeder Änderung und beim Öffnen wird neu geplant.

## Entwickeln

```bash
npm install
npm run dev          # Vorschau im Browser (Erinnerungen nur, solange die Seite offen ist)
npm test             # Einheitentests
npm run smoke        # Oberfläche im Browser (Playwright)
npm run build        # Web-Teil bauen
```

Die Windows-App ist eine [Electron](https://www.electronjs.org)-Hülle im Ordner `desktop/`:

```bash
npm run build && npm run desktop        # App im Electron-Fenster starten
npm run test:desktop                    # echter Electron-Test (unter Linux mit xvfb)
npm run dist:win                        # Installer bauen (am besten unter Windows)
```

Den Installer baut auch GitHub Actions (`.github/workflows/windows.yml`).

Die Android-App ist ein [Capacitor](https://capacitorjs.com)-Projekt im Ordner `android/`:

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug     # braucht Java 21 und das Android SDK
```

Den Bau übernimmt auch GitHub Actions (`.github/workflows/android.yml`), die APK liegt danach als Artifact beim Lauf.

### Aufbau

| Datei | Aufgabe |
|---|---|
| `src/lib/store.js`, `storage.js` | Notizen und Einstellungen auf dem Gerät |
| `src/lib/plan.js` | rechnet aus Notizen den Plan der Benachrichtigungen aus (Erinnerungen, Nachfassen) |
| `src/lib/notify.js` | meldet den Plan als Alarme beim Betriebssystem an; nach jeder Änderung wird alles neu geplant |
| `src/lib/time.js` | Zeitregeln (Standardzeit, Zeitzonen, Zeitumstellung, Nachfass-Zeitpunkt) |
| `src/lib/ai.js`, `ai-parse.js` | Claude-Aufruf und Prüfung der Antwort |
| `desktop/main.cjs`, `preload.cjs` | Windows-App: Fenster, Tray, Nachrichten, sichere Brücke zum Fenster |
| `desktop/scheduler.cjs`, `paths.cjs` | Windows: Planer (pünktlich, Nachholen, nichts doppelt) und Schutz vor Pfadtricks |
| `src/ui/*` | Oberfläche |
