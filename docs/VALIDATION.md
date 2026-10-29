# Lokaler Abschlussbericht — 28.10.2026

Vorhandene unvollständige TS/CommonJS-Grundgerüste wurden nach dem lokalen Audit
durch eine zusammenhängende, typisierte Implementierung ersetzt. Keine fremden
Repositories wurden verändert, keine Installation/Veröffentlichung durchgeführt.
Keine ZIP-, TGZ- oder sonstigen Release-Archive erstellt; kein Commit/Push.

## Geändert und ergänzt

- `src/domain`, `src/config.ts`: canonical 0–100-Werte, strikte Daten-/Config-
  Validierung, V1-Serializer und explizite Ablehnung unbekannter Schemas.
- `src/engine`: monotone/fake Uhr, gemeinsamer Scheduler im Runtime-Host,
  deterministischer Abbau, Catch-up-Cap, Hysterese/Cooldowns, serialisierte
  Mutationen, Revisionen, Save-Bündelung, Disconnect-/Shutdown-Verhalten.
- `src/persistence`: vorhandene native private ChangeForm-Properties mit
  Character-UUID/Profile-Verifikation, Versionsprüfung, expliziter Session-Modus.
- `src/api`, `examples/consumer.ts`: schreibgeschützte V1-Service-Referenz,
  immutable Snapshots, validierte Consumable-Registry, unabhängiges Beispiel.
- `src/integrations`: tatsächliche SkyMP-/Chat-/UI-Core-Verträge; private Commands,
  drei Statuszeilen und Übergangsalarme. Keine CEF-RPC-/Fokus-/Inventaränderungen.
- `locales/de.json`, `locales/en.json`: komplette deutsche/englische Texte,
  konfigurierbar mit geprüften Overrides und gebündeltem Fallback.
- `package.json`, Lockfile, TS-Konfiguration, `tools`, `tests`, Beispielconfig,
  Manifest und Dokumentation: reproduzierbarer lokaler Build und Abnahmeplan.

## Ausgeführte Prüfungen

Windows, Node.js 24.19.0, npm 11.17.0. Befehle im Repository:

| Befehl | Ergebnis |
| --- | --- |
| `npm run typecheck` | erfolgreich, keine TypeScript-Fehler |
| `npm test` | Build erfolgreich; 33 Tests bestanden, 0 fehlgeschlagen, 0 übersprungen |
| `npm run verify:fork` | echter aktueller Manifest-/Discovery-/RequireTemp-Loader, erfolgreich |
| `npm run verify:native` | vor der UI-Korrektur am Basisstand erfolgreich; aktuelle Wiederholung hängt vor dem Pluginstart im nativen Start und wurde nach Zeitlimit beendet, daher kein aktueller Native-Pass |
| `npm run verify:ui-load-order` | beide echten Plugin-Bundles im aktuellen Loader mit leerer Load Order; Metabolism vor UI Core; nachträgliche Anbindung und private Snapshots für beide Test-Actors erfolgreich |

Die Kompatibilitätstests verwenden die aktuelle lokale Chat-Registry und
kompilieren den aktuellen UI-Core-Servercode unmittelbar. Geprüft: private
DE-/EN-Statusantworten, verborgene Command-/Alias-Kollisionen, Owner-/List-State-
Validierung, initialer und erneuter UI-Snapshot, private Warnungen, TTL und Cleanup.

Weitere Tests prüfen u.a. getrennte Charaktere, doppelte Lifecycle-Ereignisse,
User-Slot-Wiederverwendung, Charakterwechsel, Reconnect ohne Offline-Abbau,
Time-Cap, 0–100/NaN/Infinity, Speicherfehler ohne Default-Reset, Revision/CAS,
konkurrierende Änderungen, Limits, Hysterese, deaktivierten Betrieb und fehlende/
inkompatible optionale APIs. Item-Adapter weist alle ungeprüften Payloads ab.

Die Native-Prüfung des zuvor geprüften Basisstands startet aus einer isolierten Testwelt unter `artifacts/`.
Sie benutzt die vorhandene Server-DLL und Skyrim.esm-Daten nur lesend. Nach
State-Übergabe wartet sie auf die tatsächlich geschriebenen JSON-ChangeForms.
Ein zweiter nativer Prozess lädt anschließend dieselben UUIDs, Werte und
Revisionen über Profile-Actors wieder. Keine echte Skyrim-Clientsession.

Geprüftes `index.cjs`, SHA-256:

```text
589cbd278ff3efbf28941131f7fd0bef38742050049abd3082d0bb07d6cc6014
```

Geprüfter lokaler SkyMP-Loaderquelltext, SHA-256:

```text
44bb27942f0b3bf919419cbe6b9e71247ae84ca117f2242865d441867ee38544
```

Maschinenlesbare Ergebnisse: `artifacts/loader-validation.json` und
`artifacts/native-validation.json`. Die Prüfungen benutzen die lokalen Änderungen
des Forks; nur die Git-HEAD-Angabe wäre keine ausreichende Versionsbeschreibung.

## Korrektur zur gemeldeten fehlenden UI-Core-API

Die frühere Implementierung hat die globale UI-Service-Referenz beim Boot
einmalig übernommen. Wenn der Loader UI Core danach startete, blieb das HUD trotz
laufendem UI Core deaktiviert. Der ergänzte Regressionstest schlug vor dem Fix
genau an der fehlenden nachträglichen Widget-Registrierung fehl.

Die korrigierte Implementierung liest den Service während eines begrenzten
Startfensters erneut und protokolliert konkrete Ablehnungsgründe. Tests prüfen
späte Verfügbarkeit, spätes `ready=true`, Versions-/Protokollfehler, fehlende
Methoden, Fehler ohne Ausgabe sensibler Exception-Texte und das Ende der Suche.
`artifacts/ui-load-order-validation.json` dokumentiert zusätzlich die echte
alphabetische Loader-Reihenfolge und das erfolgreiche Widget für zwei Actors.
Die betroffene Installation läuft laut Nutzer auf einem VPS. Dessen aktuelle
Aktivierung, Dateistände und Ladereihenfolge wurden nicht remote geprüft oder
geändert. Dieser Bericht bestätigt die lokale Reproduktion und Korrektur.
Die zusätzliche native Wiederholungsprüfung lieferte nach dem UI-Fix kein
Abschlussergebnis: Sie blieb bereits beim nativen Start vor der ersten
Plugin-Loader-Meldung hängen und wurde nach Zeitlimit beendet. Ihr alter
Erfolgsbericht in `artifacts/native-validation.json` gehört zum Basisstand
mit anderem Bundle-Hash und ist ausdrücklich kein Nachweis für den neuen Build.
Die 33 Tests und die beiden Prüfungen des echten Plugin-Loaders verwenden den
neuen Bundle-Hash; die UI-Prüfung verwendet beide echten Plugin-Entries mit
simulierten nativen Verbindungen, keine laufende Skyrim-Session.

## Lokales Artefakt und verbleibende Arbeit

Entpackter Pluginordner: `release/SkyMPMetabolism/`, einschließlich eigenständigem
`index.cjs`, Manifest, Beispiel-/Arbeitsconfig, Locales, API-Typen, Dokumentation
und Lizenz. Enthält keine Runtime-Abhängigkeit auf Sources oder `node_modules`.
Installation/Aktivierung und benötigte Gameserver-/Client-Neustarts stehen in
`INSTALLATION.md`.

Pflichtgrenzen: Echter Itemverbrauch und Schlaf benötigen die in `FORK_HOOKS.md`
beschriebenen autoritativen Hooks. Debuffs benötigen Owner-kompatible Modifier-
Komposition. Ein dauerhafter Shutdown-Commit hat noch kein natives JS-ACK.
Das HUD benötigt den separat vorhandenen UI-Core-Client/CEF-Protokoll-1-Build.
In diesem Repository ist kein zusätzlicher Launcher-/Frontend-Patch erforderlich;
Verteilung/Installation vorhandener UI-Core-Clientkomponenten bleibt gesondert.

Nicht geprüft: sichtbare Skyrim-/CEF-Anzeige, zwei echte Spieler, YACA-Audio,
Fokus/Input, realer Itemverbrauch, Bettinteraktion und tatsächliche Death-/Respawn-
Regressionen. Diese Punkte und der manuelle Plan stehen in `ACCEPTANCE.md`.
Die vollständige Ingame-Definition-of-Done wird nicht als erledigt behauptet.
