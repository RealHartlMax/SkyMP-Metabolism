# Architektur und lokaler Audit

Stand: 28.10.2026. Vor Implementierungsbeginn wurden die lokalen Quellen geprüft.
Die Nachbar-Repositories bleiben unverändert. Noch keine Ingame-Abnahme.

## Verifiziert vorhanden

- Fork `D:/GitHub/skymp`, HEAD `5a70479f1944c32837c58592fd4fcbf308564b68`, mit lokalen Änderungen.
  Geprüft: `README-plugins.md`, alle sechs in AGENTS.md genannten Scripting-,
  Properties-, Events- und Respawn-Referenzen sowie `skymp5-server/ts/index.ts`.
- `index.ts`: SaveStorage wird vor Gamemode/Plugins angeschlossen; `requireTemp`
  kopiert nur den Entry, gemeinsame `globalThis.mp`-Instanz. Discovery scannt direkte
  `Plugins`-Unterordner; Safe-Modus deaktiviert neue Plugins. Kein Plugin-Hot-Reload.
- `ts/systems/spawn.ts`: Login liefert Profile-ID; `getActorsByProfileId(id)[0]`
  lädt den bisherigen Charakter. Kein fertiges Multicharacter-Auswahlprotokoll.
  `userId` ist eine Verbindung. Eine numerische Actor-ID ist kein öffentlicher
  dauerhafter Character-Schlüssel.
- `cpp/addon/property_bindings/CustomPropertyBinding.cpp`: `private.*` braucht
  kein `makeProperty`, ist für Clients/Nachbarn unsichtbar, lässt sich mit
  `mp.get/set` lesen/schreiben. `MpObjectReference::SetPropertyValueDump` ändert
  die ChangeForm und fordert Speicherung an. `MpChangeForms.cpp` serialisiert
  `profileId` und `dynamicFields` und stellt sie beim Laden wieder her.
- `WorldState::TickSaveStorage` bündelt asynchrone Writes und fordert fehlgeschlagene
  Writes erneut an. Kein JavaScript-Hook bestätigt einen dauerhaften DB-Flush.
  DB-Pfad/-Treiber kommen aus den Gameserver-Einstellungen (`file`: standardmäßig
  `process.cwd()/world`, alternativ u.a. MongoDB). Keine zweite Character-Datenbank.
- Native `connect`/`disconnect`, `isConnected`, `getUserActor`, `getUserByActor`,
  `getServerSettings` sind implementiert; `getAllForms` braucht einen Modindex.
  `connect` ist noch kein Login/Spawn. Abgleich der Zuordnung muss danach erfolgen.
- Chat `D:/GitHub/SkyMP-Chat`, HEAD `fa048b694f358c9542bcd42914c9f3fe4bf699bd`:
  tatsächliche Registry unter `Plugins/SkyMPChat/src/registry.cjs`, API `api.d.ts`,
  `apiVersion: 1`, atomare Kollisionsprüfung inklusive Aliassen, private `ctx.reply`,
  serverseitige `ctx.userId/actorId/locale`, `unregisterCommand(owner,name)`.
- UI Core `D:/GitHub/SkyMP-UI-Core`, HEAD `6d0a0bb14cb739d16588c4d8da11ff572aeeadb2`:
  `shared/contracts.ts` und `src/runtime.ts`, API/Frontend-Protokoll 1.
  Widget-ID MUSS mit `owner + ':'` beginnen. Daher wird der Vorschlag
  `metabolism:status` durch `skymp-metabolism:status` ersetzt. Das vorhandene
  `icon-list`-Schema kann drei beschriftete Zahlen/Statuszeilen darstellen;
  beliebige Tooltip-/Progress-Gruppenfelder sind nicht erlaubt.
- Inventar: `ActionListener::OnEquip` ermittelt den Actor aus der nativen
  Verbindung. `MpActor::OnEquip` prüft ESPM-Typ und Bestand, verarbeitet ALCH/INGR,
  entfernt genau ein Item und sendet danach ein Papyrus-Event. Kein bestätigter
  JavaScript-Callback für diese erfolgreiche Transaktion. Pickup ist kein Konsum.
- `ActorValuesBinding.cpp` unterstützt partielle Basis-/Regenerationswerte,
  jedoch keine Owner-basierte additive Modifier-Verwaltung. Native Magie verändert
  dieselben Werte. Tod/Respawn verwenden `isDead` und `canRespawn`.

## Neu implementierte Verträge

- UUID im privaten nativen Charakterdatensatz zusammen mit Profile-ID und V1-State.
  Der Schlüssel lautet `character:<uuid>`, nicht Actor-ID/Account-ID/Nickname.
  Wiederanmeldung lädt denselben Datensatz; neuer Actor bedeutet neuer Charakter.
  Profile-Wechsel und kopierte UUIDs werden abgewiesen, nicht still übernommen.
- Reiner Domain-Core, monotone Uhr, begrenzter gemeinsamer Scheduler,
  serialisierte Mutationen, optimistische Revisionen, expliziter Session-Modus,
  strikte Konfiguration, deutsche/englische JSON-Kataloge und optionale Adapter.
- Öffentliche Server-API ist ausschließlich für vertrauenswürdige Gamemode-Plugins.
  Keine CEF-RPCs, Fokussteuerung, Inventaränderungen oder Admin-Commands.

## Blockiert durch fehlenden Hook

- Native Item-Use-Commit mit servergenerierter Transaktions-ID für JavaScript:
  Registry ist nutzbar, tatsächlicher Konsum bleibt geschlossen. Schlaf hat
  ebenfalls keinen geprüften autoritativen Hook. Siehe `FORK_HOOKS.md`.
- Bestätigter dauerhafter DB-Flush/Crash-Recovery aus JS: `flush` übergibt den
  aktuellen Stand an SaveStorage, garantiert keinen fsync/DB-Commit. Harter Kill
  kann ungesicherte Daten verlieren. Diese Grenze gilt auch beim Shutdown.
- Owner-basierte ActorValue-Komposition fehlt. Debuffs, Schaden und Tod bleiben
  deaktiviert; Aktivierung nicht implementierter Flags wird abgewiesen.
- Sichtbares HUD benötigt den separat verteilten UI-Core-Client/CEF-Protokoll-1-
  Build. Server-/Native-Tests beweisen keine Skyrim-/CEF-/Zweispieler-Abnahme.

## Optionaler Ausbau

Echter Character-Provider für Multicharacter-Wechsel, bestätigte Konsum-/Bett-
Transaktionen, sichere Modifier-Komposition, UI-Core-Tooltip-Vertrag, Temperatur,
Krankheiten und Berufe. Keine simulierten Produktionsfunktionen dafür.
