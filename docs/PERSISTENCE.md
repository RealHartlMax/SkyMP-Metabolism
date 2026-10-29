# Charakterpersistenz

Standard ist `persistence.mode: "native"`. Im selben bestehenden Actor-ChangeForm-
Datensatz liegen UUID und Werte in `private.skympMetabolism`:

```json
{
  "schemaVersion": 1,
  "characterId": "character:00000000-0000-4000-8000-000000000000",
  "profileId": 123,
  "state": {
    "schemaVersion": 1, "characterId": "character:00000000-0000-4000-8000-000000000000",
    "satiety": 100, "hydration": 100, "rest": 100,
    "revision": 1, "lastPersistedAt": 1793145600000
  }
}
```

Keine zweite Account-/Character-Datenbank und keine Dateien unter `__dirname`.
Die native SaveStorage schreibt diese `dynamicFields` gemeinsam mit Profile-ID,
Inventar und Weltzustand. Pfad/Treiber sind die vorhandenen Servereinstellungen,
z.B. `databaseDriver: "file", databaseName: "world"`, somit
`<Server-cwd>/world/changeForms`. Das Plugin öffnet keine eigene Datenbank und
ändert keine privaten Gameserver-Einstellungen.

UUID wird nur erstellt, wenn die Property wirklich fehlt/null ist. Eine vorhandene
Envelope oder ein State wird strikt validiert, einschließlich endlicher Stats,
Range, Epoch, Profile-Owner und Character-ID. Fehler stoppen nur diesen Charakter;
kein stiller Reset, kein Korrumpiert-zu-Default-Fallback. Neues Actor-Record bedeutet
neuer Charakter. Der aktuelle Spawn-Code lädt den ersten persistierten Actor des
Profils. Ein künftiges Multicharacter-System muss bewusst den richtigen Actor
auswählen. Account-Umzüge/Profile-Wechsel brauchen eine explizite Migration.
Gesicherte Actor-Records nicht kopieren: UUIDs dürfen nicht dupliziert werden.

Das Adapterinterface bietet `load`, `save(state, expectedRevision?)`, `delete`,
`flush`, `close`. `expectedRevision=0` bedeutet Neuanlage. Die Engine merkt sich
die zuletzt **gespeicherte** Revision, auch nach vielen noch ungespeicherten
Ticks. Beim Save wird atomar innerhalb der Node-Ausführung gegen die aktuelle
native Envelope geprüft und die ganze Property ersetzt. DB-Multiprozess-CAS ist
damit nicht implementiert; mehrere Gameserver dürfen nicht dieselben Character-
Records unkoordiniert bearbeiten.

Autosave bündelt schmutzige States (120 Sekunden), Disconnect/Stop versuchen
sofortige Übergabe. Schreibfehler lassen den Zustand schmutzig im begrenzten
Cache; offline Charaktere werden dabei nicht weiter abgebaut. Erneuter Save kann
nach I/O-Reparatur erfolgreich sein. Asynchrone `stop`-Fehler sind sichtbar und
lassen sich erneut versuchen. Beim Node-Exit gibt es zusätzlich eine synchrone
Übergabe der letzten Werte, weil der Exit-Callback keine Promises abwarten kann.

**Dauerhaftigkeitsgrenze:** Native `mp.set` bestätigt die ChangeForm-Änderung.
SaveStorage schreibt erst über die normalen Serverticks asynchron. Der vorhandene
File-Treiber nutzt `.tmp` und anschließendes Rename; Lesefehler werden im Fork
protokolliert, temporäre Dateien sind keine fertigen Saves. Ein garantierter
fsync/DB-Commit oder vom Plugin erzwungener letzter SaveStorage-Tick existiert
nicht. Ein harter Kill oder sofortiges `process.exit` kann ungeschriebene Updates
verlieren. `flush()` behauptet daher keinen dauerhaften Commit. Keine eigenen
SIGINT-/SIGTERM-Handler ersetzen die Server-Shutdown-Policy.

`npm run verify:native` prüft echte File-SaveStorage und Wiederladen in einem
zweiten nativen Prozess. Das ist keine Garantie bei Stromausfall und kein Beleg
für MongoDB oder andere nicht getestete Treiber. Der fehlende Commit-Hook steht
in `FORK_HOOKS.md`.

V1 ist das erste auslieferbare Schema. Unbekannte frühere/spätere Versionen werden
abgewiesen; es gibt keine erfundene Migration aus einem nie gelieferten Schema.
Künftige Migrationen müssen reine geprüfte Konverter vor `deserializeState`
einführen. Vor manuellen Änderungen Welt-Datenbank sichern.

`session-only` benötigt keine `mp.get/set`-Datenhaltung und speichert nie eine
vermeintlich stabile Actor-ID. Es verwendet neue `session:<uuid>` je Verbindung,
meldet den Modus im Serverlog/API und verwirft die Daten beim Disconnect.
Reconnect/Neustart starten daher ausdrücklich neu bei konfigurierten Defaults.
Ein nativer Speicherfehler schaltet **nicht** automatisch in diesen Modus um.
