# 🔔 Don't forget

Schlichte Notizen-App zum Erinnern: Gedanken in Sekunden festhalten und zur Standardzeit (z. B. 17:00)
oder zu einer eigenen Uhrzeit per Benachrichtigung erinnert werden, auch auf dem Sperrbildschirm.

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

## Claude-Schlüssel (nur für Sprechen und ✨)

Ohne Schlüssel läuft alles andere. Mikrofon und ✨ melden dann „Claude-Schlüssel fehlt“.

1. Auf [console.anthropic.com](https://console.anthropic.com) einen **API-Schlüssel** anlegen (unabhängig von deinem claude.ai-Abo,
   Abrechnung nach Verbrauch, für kurze Notizen Cent-Beträge).
2. In der App ⚙ → **KI (Claude)** einfügen. Der Schlüssel bleibt nur auf diesem Gerät.

Der gesprochene oder getippte Text geht direkt vom Gerät an Anthropic und wird dort zu Terminen verarbeitet. Sonst verlässt nichts das Gerät.

## Grenzen

- **Kein Abgleich** zwischen Geräten. Notizen gibt es nur auf dem Gerät, auf dem du sie angelegt hast.
- **Deinstallieren löscht die Notizen.** Es gibt keine Sicherung in der Cloud.
- **iPad und Windows-PC** sind in dieser Version **nicht** dabei. Erinnerungen bei geschlossener App brauchen auf jedem Gerät eine
  richtige App (iPad: Mac oder Cloud-Build und Apple-Konto, Windows: eine Desktop-Hülle).
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
| `src/ui/*` | Oberfläche |
