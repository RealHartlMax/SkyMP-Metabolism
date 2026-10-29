# AGENTS.md — SkyMP Metabolism

> Arbeitsauftrag für Coding-Agenten. Diese Datei ist für die Wurzel eines **eigenständigen** Repositories `SkyMP-Metabolism` gedacht. Alle hier benannten API-Beispiele sind **zu entwickelnde Verträge**, keine Behauptung bereits vorhandener Runtime-Funktionen.

## 0. Mission und Projektschnittstellen

Entwickle ein eigenständiges, **serverautoritäres RP-/Survival-Plugin** für SkyMP: Ernährung/Sättigung, Flüssigkeitsversorgung und Erholung/Müdigkeit als Charakterzustände mit Tick-System, Persistenz, Gameplay-Auswirkungen und sauberer Erweiterbarkeit. Später optional: Körpertemperatur, Krankheiten, Verletzungen und Heiler-/Berufsinteraktion.

- SkyMP-Fork: `https://github.com/RealHartlMax/skymp`.
- Existierendes Chat-Projekt: `https://github.com/RealHartlMax/SkyMP-Chat`; lokaler Pfad beim Nutzer: **`D:\GitHub\SkyMP-Chat`**.
- Separates UI-Core-Projekt: erwartetes lokales Verzeichnis `D:\GitHub\SkyMP-UI-Core`, sofern bereits angelegt (Verzeichnisname prüfen, nicht voraussetzen).
- Für dieses Projekt empfohlener lokaler Pfad: `D:\GitHub\SkyMP-Metabolism` (konventioneller Vorschlag, kein belegtes Verzeichnis).
- Plugin-ID: `skymp-metabolism`; Zielpaket `Server/Plugins/SkyMPMetabolism/` relativ zum tatsächlichen SkyMP-Server-Arbeitsverzeichnis.
- Sprache: Dokumentation und Standard-UI Deutsch, Code/öffentliche API Englisch; i18n wenigstens Deutsch/Englisch vorbereiten.
- Ergebnis: startfähiges Gamemode-Plugin, Runtime-API, Charakterpersistenz, Tests, Beispielkonfiguration, dokumentierte Chat-/UI-Integration. Es muss ohne UI Core **weiterhin funktionieren**.

**Verbindliche Trennung:** Metabolism führt die Spielregeln und Datenhaltung aus. UI Core rendert Status und Benachrichtigungen. Chat bietet Slash-Commands. **Keinen zweiten Chat, kein eigenes großes CEF-Frontend und kein zusätzliches UI-Framework innerhalb von Metabolism entwickeln.**

## 1. Audit vor jeder Implementierung

1. Den **lokal aktuellen** SkyMP-Fork ermitteln und `README-plugins.md`, `docs/docs_serverside_scripting_reference.md`, `docs/docs_clientside_scripting_reference.md`, `docs/docs_properties_system.md`, `docs/docs_events_system.md`, `docs/docs_respawn_control_system.md`, `skymp5-server/ts/index.ts` prüfen. Remote GitHub kann hinter dem lokalen Build liegen; lokal implementierte, tatsächlich funktionierende APIs sind maßgeblich.
2. Tatsächliche Charakteridentität und Datenhaltung feststellen: Login/Multicharacter-Status, `userId`/Actor-ID/Charakter-ID, Save Storage, Datenbankanbindung, Respawn, Entkopplung von Verbindung zu Charakter. **Nicht** erraten, dass eine Actor-Form-ID eine dauerhafte Charakter-ID ist.
3. Inventar-/Itemverbrauch wirklich nachverfolgen (inkl. bereits existierender Hooks/Events und Servervalidierung). Nicht einfach `mp.onItemUse`, `mp.removeItem`, `mp.sendChatMessage` o. ä. behaupten, bevor sie belegt sind.
4. Unter `D:\GitHub\SkyMP-Chat` sofern erreichbar `AGENTS.md`, tatsächliche Command-Registry und Export-/Permission-/Message-API lesen. Das öffentlich vorhandene `RealHartlMax/SkyMP-Chat/AGENTS.md` nennt **als Entwurf** `globalThis.skympChat`, `registerCommand`, `sendToPlayer`; reale Benennung anhand der implementierten Quellen verifizieren.
5. UI-Core-Repo (wenn vorhanden) lesen; den tatsächlich implementierten API-Vertrag und dessen `apiVersion` nutzen. Falls noch nicht implementiert, einen optionalen Adapter vorbereiten und mit einem Fake in Tests validieren, aber keine vorgetäuschte Echtintegration behaupten.
6. Bestehende ActorValues-/Effekte-/Wetter-/Gameplay-Systeme identifizieren. Konflikte mit Respawn, dem Spiel selbst, späteren Heiler-/Magie-/Rassen-Plugins untersuchen.
7. In `docs/ARCHITECTURE.md` schriftlich trennen: **verifiziert vorhanden / neu implementiert / blockiert durch fehlenden Hook / optionaler Ausbau**. Nicht vor dem Audit mit eigenwilligen Core-Änderungen beginnen.

### Plugin-Loader-Realität

Gemäß der verfügbaren `README-plugins.md` sind `kind: gamemode` mit globalem `mp` und `kind: process` verfügbar. Ein `gamemode`-Entry wird derzeit in temporären JS-Code kopiert; darum vorab `index.cjs` **vollständig** als CommonJS bündeln. Kein relatives `require('./src/...')` zur Laufzeit aus dem temporären Entry; `__dirname` zeigt nicht zuverlässig auf den Plugin-Installationsordner. Ein `process`-Plugin kann ohne zusätzliche IPC nicht direkt mit `mp` arbeiten. Der Loader bietet momentan keine automatische Plugin-Abhängigkeitsprüfung, kein eigenes Plugin-Clientpaket und kein Live-Hot-Reload. Dokumentiere Installationsaktivierung, `pluginsLoadOrder` und erforderliche Neustarts.

## 2. Fachmodell: Drei klare Kernwerte

**Zentraler Grundsatz: Der Server speichert Wohlbefinden auf 0–100; höher ist immer besser.** Keine gemischte Semantik in Core/Netzwerk, bei der Hunger 100 schlecht, Durst 100 schlecht, aber Energie 100 gut wäre.

```ts
interface MetabolismStateV1 {
  schemaVersion: 1;
  characterId: string;         // stabile Identität aus geprüftem Charaktersystem
  satiety: number;              // 0 = ausgehungert, 100 = satt
  hydration: number;            // 0 = dehydriert, 100 = gut versorgt
  rest: number;                 // 0 = erschöpft, 100 = ausgeruht
  lastPersistedAt: number;      // Unix-Epoch ms; nur Metadaten
  revision: number;             // monotone Version für UI-/State-Reconciliation
}
```

Anzeigebezeichnungen dürfen bewusst invertiert werden:

- **Hungeranzeige:** `hunger = 100 - satiety` (100 = großer Hunger), alternativ direkt „Sättigung“ darstellen.
- **Durstanzeige:** `thirst = 100 - hydration` (100 = starker Durst), alternativ „Flüssigkeit“.
- **Müdigkeitsanzeige:** `fatigue = 100 - rest` (100 = völlig erschöpft), alternativ „Erholung“.

Die API verwendet ausschließlich `satiety/hydration/rest` als canonical values. Transformation nur am UI-Rand und immer dokumentiert. 0–100 clamping und endliche Zahlen erzwingen; `NaN`, `Infinity`, negative Verbrauchsraten, String-zu-Number-Injections verwerfen.

### Default-Gameplay (RP-freundlicher MVP, konfigurierbar)

- Neue Charaktere starten mit 100/100/100 (konfigurierbar). Bestehende gespeicherte Zustände **niemals** durch Default-Initialisierung überschreiben.
- Abbau ausschließlich während der verifizierten **Online-Spielzeit**, standardmäßig **kein Offline-Abbau**; optional später `offlineDecay` mit Catch-up-Cap.
- Zeitbasis standardmäßig reale verstrichene Sekunden, **nicht** Skyrim-Ingame-Zeit; optionaler späterer Adapter für beschleunigte Spielzeit. Werte und Balance ausdrücklich in der Doku festhalten.
- Beispiel-Defaults: `satietyDecayPerHour=5`, `hydrationDecayPerHour=8`, `restDecayPerHour=4`, `tickIntervalSeconds=30`. Diese sind Startwerte fürs Balancing, keine „Realismus“-Behauptung.
- Statusschwellen bei z. B. 50 / 25 / 10; Meldungen nur bei **Threshold-Wechsel**, nicht pro Tick. Hysterese für Hin-/Her-Flattern an Grenzen.
- Standardmäßig **keine automatische Tötung** durch Hunger/Durst/Erschöpfung. Primär graduelle, separat einschaltbare und dokumentierte Debuffs. Debug-/Testmodus erlaubt schnelle Simulation; Produktion benutzt normale Limits.
- Von Skyrim bereits verwendete Gesundheit, Ausdauer, Magicka nicht parallel als eigene Wahrheitsquelle führen. Falls Debuffs ActorValues verändern, aktuelle `actorValues`-/Regenerationssemantik im lokalen Fork prüfen, unerwünschte Überschreibungen anderer Systeme verhindern und reversible Änderungen implementieren.
- Bei Tod/Respawn den Charakterzustand nicht ungefragt resetten; explizite Konfiguration und Kompatibilitätsprüfung mit existierender Death-/Respawn-Logik.

## 3. Kernarchitektur

```text
[Verifizierte SkyMP Session / Player-Actor / Charakter-ID]
       |
       v
[Metabolism Core — Domain Engine, State Cache, Tick Scheduler]
       |       |         |
       |       |         `-> Event-/Effect-Adapter (serverautoritativ)
       |       `-> Persistence Adapter (charaktergebunden)
       `-> Nutrition/Consumption Adapter (Inventar / Gegenstände / Ruhe)
                 |
       +-------> UI-Core-Adapter [optional; Statuswidgets und Alerts]
       `-------> SkyMP-Chat-Adapter [optional; /status usw.]

[Metabolism Public API] <-> [andere RP-/Heiler-/Händler-/Jobs-Plugins]
```

### 3.1 Serverautoritativer Ticker

- Ein scheduler pro Server, **kein eigener `setInterval` pro Spieler**. Zustand aller aktiven Charaktere in einer begrenzten Struktur und je Verarbeitungsvorgang per stabiler Identität adressieren.
- Verstrichene Zeit aus robuster monotonic-time-Quelle berechnen; gegen Lagspikes, Rechner-Schlaf, Pausen und Reloads mit dokumentiertem Catch-up-Cap schützen.
- Auf mehrfacher Eventregistrierung, Duplikat-Join und Reconnect ohne getrennte Charakteridentität achten. Beim Disconnect einen finalen gesicherten Save auslösen, Entity-/Timer-Handles freigeben.
- Idempotenz bei Start/Stop und wiederholten Lifecycle-Events. Die tatsächlichen vorhandenen SkyMP-Events benutzen, keine fiktiven `mp.on('playerJoin')`-Garantien aus Beispielcode ableiten.
- Schwellenevents nur bei echter Zustandsänderung; bei mehreren Samples pro Sekunde keine Event- oder Datenbankflut.
- State-Updates versionieren (`revision`) und über zeitlich zusammengefasste UI-Snapshots publizieren. Gameplay unabhängig von CEF-FPS und Client-Onlinezustand.

### 3.2 Persistenz je Charakter

- **Stabile Character-ID** aus dem tatsächlich vorhandenen (gegebenenfalls künftigen) Character-System; ggf. `accountId + characterSlot` als verifizierter zusammengesetzter Schlüssel. **`userId`, Session-ID, Nickname oder temporäre Actor-ID nicht ungeprüft als persistente Charakteridentität verwenden**.
- Persistenzinterface `load(characterId)`, `save(state, expectedRevision?)`, `delete(characterId)` und ein klarer Serializer mit `schemaVersion`, Validation und späteren Migrationsroutinen.
- Verwende vorrangig die bestehende bewährte Datenbank/Save-API. Falls nicht verfügbar, implementiere nur nach dokumentierter Auswahl eine JSON-Datei-/SQLite-Alternative in einem **ausdrücklich ermittelten Data-Pfad**; die Daten dürfen nicht unter temporärem Loader-`__dirname` liegen. Keine stille Neuanlage einer konkurrierenden Character-Datenbank.
- Atomare Schreibweise und Recovery bei Absturz; Writes bündeln/debouncen, aber beim Disconnect und Shutdown flushen. Konkurrierende Updates und Speicherversionen berücksichtigen.
- Fehlt die stabile Identität/autoritative Persistenzmöglichkeit, **nicht** eine defekte Speicherlösung als fertig deklarieren. Mindestens einen funktionsfähigen, nachvollziehbar gekennzeichneten Session-Only-Modus plus eindeutigen Integrationsblocker liefern und vorhandene Hook-Optionen prüfen.
- Reconnect von Spieler A darf nicht den Zustand eines anderen Charakters übernehmen. Login/Charakterwechsel und Multicharacter künftig sauber abbilden.

### 3.3 Nahrungsmittel, Getränke, Schlaf und Items

Eine erweiterbare konsumierbare-item-Registry für anderen Plugins:

```ts
type ConsumableDefinition = {
  key: string;
  itemId: string;                     // reale Item-ID nach verifiziertem Inventarformat
  effects: Partial<Record<'satiety' | 'hydration' | 'rest', number>>;
  cooldownSeconds?: number;
  owner: string;
};
```

- JSON-/TS-Definitionen für Beispiele aus Skyrim (z. B. Brot, gekochtes Fleisch, Wasserflasche) nur mit **nachweislich korrekten** Item-IDs; ohne geprüfte Form-IDs zunächst neutrale Test-Items und klar deklarierte Beispiele.
- Essen/Trinken wird **serverseitig autorisiert**, Inventarbestand vor Verbrauch geprüft und wirklich genau einmal abgezogen. Erst nach erfolgreichem, idempotentem Verbrauch Zustand aktualisieren. Fehlversuch → keine Heilung, kein zusätzlicher Itemverlust.
- Erkunde vorhandene Item-Use-Hooks und Inventartransaktionen. Falls keine sichere User-Item-Use-API existiert, eine klar umrissene Adapter-Erweiterung im Fork vorschlagen und mit echter Integration testen. **Keine** nur vom Browser behauptete `itemConsumed=true`-Nachricht als Beleg akzeptieren.
- Ruhe/Schlaf über nachweisbare Spielereignisse/Interaktion, keine selbst berichtete „ich habe 8 Stunden geschlafen“-Clientangabe. Ersatz für fehlende Bett-/Sleep-Hooks als echte, geprüfte serverseitige Interaktion mit Reichweite und Berechtigung modellieren, sofern möglich.
- Keine Item-Erzeugung durch Nutzerbefehle und kein unbegrenztes Konsumieren derselben Ressource via Replay. Auditable, aber datensparsame Ergebnislogs.
- Verbrauchseffekte können positiv oder negativ sein (Gift/verdorbenes Essen später), müssen jedoch anhand des registrierten trusted Plugins validiert werden.

### 3.4 Gameplay-Effekte

- Kritische Werte können in Phase 2 **konfigurierbare Debuffs** auslösen, z. B. verringerte Stamina-Regeneration oder langsamere Erholung. Implementierung nur über **tatsächlich verifizierte** SkyMP-/SkyrimPlatform-/ActorValues-Schnittstellen.
- Keine fremden Basiswerte dauerhaft platt überschreiben; wenn Multiplikatoren zu schreiben sind, vorher aktuelle Werte bzw. andere Quellen berücksichtigen. Effekte durch eigenen Owner/Source identifizierbar halten und vollständig zurücknehmen können.
- „Metabolism aus“ bedeutet: Ticker beendet, HUD entfernt, eigene Debuffs zurückgesetzt, andere Plugins und Originalwerte bleiben erhalten.
- Standardwerte und Effektstärken für RP-Balance moderat. Feature Flags: `debuffs.enabled`, `damage.enabled=false`, `death.enabled=false`, jeweils nur bei eindeutiger Implementierung.
- Eigene Health-/Magicka-/Stamina-Anzeigen nicht als neue Spielerstatus-Wahrheit einführen; UI Core kann Skyrim-Stats nur über nachgewiesene APIs ergänzen.

## 4. Öffentliche Plugin-API — V1-Vorschlag

Nach Prüfung, ob gemeinsame Gamemode-Plugins wirklich denselben Node-Prozess/Global-Scope teilen, eine **versionierte** Service-Registry anbieten, z. B. `globalThis.skympMetabolism` (neue API, nicht vorhanden).

```ts
type MetabolismCharacterId = string;
type MetabolismStat = 'satiety' | 'hydration' | 'rest';

type MetabolismSnapshot = {
  schemaVersion: 1;
  characterId: string;
  satiety: number;
  hydration: number;
  rest: number;
  revision: number;
};

type MetabolismReason =
  | 'food' | 'drink' | 'sleep' | 'disease' | 'job' | 'admin' | 'system';

interface SkyMpMetabolismApiV1 {
  readonly apiVersion: 1;
  getState(characterId: MetabolismCharacterId): Readonly<MetabolismSnapshot> | null;
  adjustStat(characterId: MetabolismCharacterId, stat: MetabolismStat,
             delta: number, reason: MetabolismReason): Promise<MetabolismSnapshot>;
  registerConsumable(def: ConsumableDefinition): void;
  unregisterConsumable(owner: string, key: string): void;
  onStateChange(owner: string, handler: (state: Readonly<MetabolismSnapshot>,
    changedStats: MetabolismStat[]) => void): () => void;
  getStatus(): { ready: boolean; apiVersion: number; activeCharacters: number };
}
```

Sicherheits- und Vertragsregeln:

- `getState` gibt immutable copy zurück; Änderungen nur über serverautorisierte Funktionen. Das Interface ist **nur für vertrauenswürdige Server-Plugins**, nicht als frei erreichbarer CEF-RPC-Endpunkt.
- Plugin-/Owner-Namespace, Parameter/Range-Checks, Race-Concurrency, Rate Limits, idempotente Transaktionen und Exceptions absichern.
- Berechtigte Änderungen protokollieren (Owner/Reason/Delta/Charakter-ID) ohne unnötige persönliche Daten.
- Subscriptions pro Owner sauber verwalten, unsubscribe beim Lifecycle soweit vorhanden. Keine Events bei unverändertem Zustand.
- Später ggf. `registerModifier`, `registerCondition`, `getEnvironmentalExposure`; in MVP nur die benötigten einfachen Verträge implementieren.
- Durch Versionierung und klaren Vertrag sollen Heiler, Alchemie, Jobs, Rassen, Krankheiten und Wirtschaft unabhängig entwickelt werden können.

## 5. Optionale Integration: UI Core

Metabolism **darf nicht vom UI Core abhängig sein**, um rechnen oder speichern zu können.

1. Beim Boot verfügbare, verifizierte `skympUi`-API und Versionskompatibilität prüfen; ansonsten normalen Betrieb ohne HUD sicherstellen.
2. Falls kompatibel: Widget `metabolism:status` mit registriertem `owner='skymp-metabolism'` anlegen. UI Core verwaltet Widget-/CEF-Lifecycle, Metabolism liefert validierte Daten.
3. Für `satiety/hydration/rest` 0–100 drei Statusindikatoren mit klaren Labels, Tooltips und aus den Werten korrekt abgeleiteten Zuständen. `100 - rest` für „Müdigkeit“ **nur in der Präsentation**, nie intern.
4. Notifications nur bei Schwellenwechseln (z. B. „Du bekommst Durst.“) und mit Cooldown. Keine Meldungsflut pro Ticker.
5. Initialer Snapshot beim Ready/Reconnect/Charakterwechsel; danach nur gedrosselte Updates. Keine Zustände anderer Charaktere oder geheimen Admin-Daten an CEF schicken.
6. Wenn das UI-Core-API fehlt/aktualisiert wird, nicht abstürzen; loggen, fallback auf Chat-/Serverstatus. **Keine neue Browser-Fokus-Hotkey-Registrierung** vornehmen.
7. Die eventuell vorhandene neue UI-Core-API aus `D:\GitHub\SkyMP-UI-Core` **vor** finaler Implementierung prüfen. Vertragsbeispiele in dessen AGENTS.md sind zunächst nur Vorschläge.

## 6. Optionale Integration: SkyMP Chat

Das laufende Chat-Plugin darf nicht erneut implementiert oder durch Metabolism überschrieben werden. Sofern `D:\GitHub\SkyMP-Chat` existiert, die **tatsächlich vorhandene** Chat-Registry lesen (nicht die geplante Beispiel-API als gegeben annehmen) und **normale Fremdplugin-Commands** registrieren:

- `/status`: private, gut lesbare aktuelle Angaben zu Sättigung, Flüssigkeit und Erholung inklusive konkretem Tooltip zur Semantik; keine Server-Konsolencalls.
- `/metabolism`: Alias oder private ausführlichere Anzeige; Namen vor Registrierung auf Kollision prüfen.
- Optional `/metabolismadmin ...`: **ausschließlich** nach echter serverseitiger Rollen-/Permission-Verifikation; standardmäßig deaktiviert. Erlaubte Debug-Aktionen möglichst über isolierte Dev-Testfixtures statt Produktionsbefehle.
- Keine `feed`, `drink`, `rest`-Commands einführen, solange sie nicht an echte geprüfte Inventar-/Schlaftransaktionen gekoppelt sind. „Essen aus dem Nichts“ ist keine akzeptable Produktionseinrichtung.
- Fehlt Chat, läuft die komplette Metabolism-Engine weiter. Nachvollziehbare Warnung, kein Serverstart-Crash.
- Integrationstests mit aktivem und deaktiviertem Chat. Chat und YACA-TS dürfen durch diese Registrierung/Funktion nicht beeinträchtigt werden.

**Wichtig:** `SkyMP-Chat/AGENTS.md` nennt `globalThis.skympChat` und `registerCommand` als gewünschte API. Diese erst übernehmen, wenn im lokalen Quellcode implementiert und lauffähig; andernfalls in `docs/INTEGRATIONS.md` als notwendige Anpassung dokumentieren und einen isolierten Adapter liefern.

## 7. Konfiguration (beispielhafte zu implementierende Struktur)

Bevorzuge eine konventionelle Konfigurationsquelle des echten Gameservers. Wenn `config.json` im Pluginordner verwendet wird, Pfad **explizit** vom bestätigten `process.cwd()`/Pluginpfad ableiten, nicht von temporärem `__dirname`. Defaults validieren, unbekannte/bösartige Werte ablehnen und Migrationen dokumentieren.

```json
{
  "enabled": true,
  "schemaVersion": 1,
  "clock": { "mode": "real-online", "tickIntervalSeconds": 30,
             "maxCatchUpSeconds": 120, "offlineDecay": false },
  "initialState": { "satiety": 100, "hydration": 100, "rest": 100 },
  "decayPerHour": { "satiety": 5, "hydration": 8, "rest": 4 },
  "thresholds": { "warning": 50, "critical": 25, "severe": 10,
                   "hysteresis": 3 },
  "debuffs": { "enabled": false },
  "damage": { "enabled": false },
  "death": { "enabled": false },
  "ui": { "enabled": true, "widgetId": "metabolism:status" },
  "chat": { "enabled": true, "statusCommand": "status" },
  "persistence": { "autosaveSeconds": 120 }
}
```

Die Werte sind **Balance-Startannahmen**, nicht abschließend abgestimmte Spielregeln. Timeout/limits validieren; in Tests beschleunigte simulierte Zeit per Clock-Injektion statt manuell DateTime hochzudrehen. Wenn `enabled=false`, darf der Dienst weder Status abbauen noch weiter fremde ActorValues verändern.

## 8. Ausbaustufen außerhalb des Pflicht-MVP

### 8.1 Temperatur / Kälte / Hitze

Skyrim ist klimatisch variabel; Temperatur zuerst als neues optionales Modul designen, **nicht** als Fake-Statistik erraten. Exposition muss auf echten geprüften Daten beruhen: Region/Zelle/Welt, Wetter, Tageszeit, Wasser/Nässe, Rüstungs-/Kleidungswirkung, Wärmequellen. Übermäßige Call-Frequenz und Teleport-/Zellenwechsel beachten. Neutrale Fallbacks, wenn Wetter-/Kleidungshooks fehlen. RP-Balancing und Race-Resistenz später als eigene Provider, keine fest verdrahteten Boni ohne Design.

### 8.2 Krankheiten / Vergiftungen

Separates Condition-Registry-Modul mit Duration, Quelle, Flags, Behandlung, Resistenz; keine frei durch Client gesetzten Diagnosen. Ein späteres Heiler-Plugin soll gesicherte `getConditions/tryTreat`-API verwenden können. V1 braucht dafür noch keine Fake-Implementation.

### 8.3 Interaktion mit Berufen / Wirtschaft

Händler stellt Essen/Trinken über das Inventarsystem bereit. Heiler behandelt verifizierte Krankheiten oder negative Zustände. Rastplätze/Herbergen bieten Erholungsinteraktionen. Jede Transaktion serverautoritativ, optional über Job-/Fraktions-Rechte und Gebühren; Metabolism kennt nur standardisierte Provider und Änderungen, nicht die spezifische Stadt-/Joblogik.

## 9. Tests und Definition of Done

Automatisierte Unit-/Integrationstests mit Fake-Clock, Fake-Persistenz, Fake-UI-Core-/Chat-Adapter. Danach manueller Zweiclient-Plan mit tatsächlichem Skyrim-/SkyMP-Build:

- [ ] Manifest wird vom echten Plugin-Loader erkannt und über Dashboard/Ladereihenfolge startbar.
- [ ] Release-`index.cjs` ist ohne lokale Source-/`node_modules`-Pfadannahmen lauffähig.
- [ ] Charakter A und B haben strikt getrennte, stabile Zustände; Disconnect/Reconnect und Charakterwechsel keine Kontamination.
- [ ] Drei Werte starten definiert; deterministischer Abbau gemäß simulierter Online-Sekunden; 0–100-Clamp, NaN/Infinity abgewiesen.
- [ ] 30-Sekunden-Scheduler mit Zeit-Catch-up-Cap verhält sich bei Lag, Doppelticks und Reconnect deterministisch.
- [ ] Offline-Zeit verändert **standardmäßig keine** Werte.
- [ ] Save/Load/Revision/Migration und Shutdown-Flush getestet; wenn persistente Character-ID im realen Build fehlt, Einschränkung ehrlich als Blocker deklarieren.
- [ ] Mehrfache Anmeldung/Shutdown/Neustart führt nicht zu doppelten Tick-Handlern, Buffs oder Subscriptions.
- [ ] Verbrauch eines Items nur mit echtem Serverbestand, genau einer Abbuchung und genau einer Stat-Anpassung; Replays/gefälschte Client-Payloads wirkungslos. Fehlt der reale Hook: gesonderten Blocker ausweisen, keine Scheinabnahme.
- [ ] Warnungen erscheinen nur bei Threshold-Wechseln, Hysterese und Cooldowns funktionieren.
- [ ] Wenn eigene Debuffs deaktiviert werden, sind alle selbst verantworteten Änderungen reversibel und fremde Werte bleiben erhalten.
- [ ] Metabolism läuft korrekt **ohne UI Core**; UI-Core-Widget zeigt bei verfügbarer echter Integration korrekten Snapshot und Updates an.
- [ ] Metabolism läuft korrekt **ohne Chat**; `/status` funktioniert bei real verfügbarer Command-Registry und ist privat.
- [ ] Andere Plugins können über API lesen und autorisiert `adjustStat` ausführen; von CEF frei erfundene Charakter-/Admin-Identitäten bewirken nichts.
- [ ] YACA-TS, Ingame-Chat, Skyrim-Input/CEF-Fokus und bestehende Health-/Respawn-Mechanik zeigen keine Regressionen.
- [ ] Frontend-/Server-Versionen und Deployment sind vollständig dokumentiert.

## 10. Zielstruktur des separaten Repositories

```text
SkyMP-Metabolism/
  AGENTS.md
  README.md
  package.json
  tsconfig.json
  src/
    domain/                # state, rules, thresholds, typed contracts
    engine/                # Tick scheduler, Session-/Character-Lifecycle
    persistence/           # echte, austauschbare Storage-Adapter
    integrations/
      skymp/               # bestätigte Events und ActorValues
      chat/                # optionaler Command-Adapter
      ui-core/             # optionaler Widget-/Notification-Adapter
      inventory/           # validierter Verbrauch/Items
    api/                   # versionierte Public API
  config/
    config.example.json
  tests/                   # unit/integration/compatibility
  examples/                # registriertes Consumable / Fremdplugin
  docs/
    ARCHITECTURE.md
    API.md
    INTEGRATIONS.md
    PERSISTENCE.md
    BALANCING.md
    INSTALLATION.md
  release/
    SkyMPMetabolism/
      plugin.json
      index.cjs
      config.example.json
      README.md
```

Pfade dürfen an lokale Konventionen angepasst werden. Das `release`-Paket muss allein installierbar sein, sobald seine **tatsächlich erforderlichen Server- und optionalen Client-Komponenten** vorhanden sind. Eine eventuell erforderliche SkyMP-Core-Änderung als isolierte Patch/PR-Dokumentation liefern statt unbemerkt andere Repositories zu verändern.

## 11. Reihenfolge der Umsetzung

1. **Audit + Architekturentscheidungen**: reale Versionen, Charakteridentität, Datenbank, Inventar-Hooks, Chat-/UI-APIs; benannte Blocker dokumentieren.
2. **Domain V1**: 3 Werte, pure Stat-Funktionen, Clamp, Tick/Clock, Threshold-State-Machine; Tests ohne Game.
3. **Charakter-Lifecycle + Persistenz**: Load/Save/Reset/Migration, Reconnect, Race Conditions; echte Datenbankintegration oder expliziter Session-Only-Fallback.
4. **SkyMP-Adapter**: nachweislich realer Serverzustand, Online-Timer, verifizierte ActorValues und optional sichere Consumables.
5. **Plugin-API**: konsumierbares, dokumentiertes V1-Serviceinterface und unabhängiger Beispielkonsument.
6. **Chat-Adapter**: private `/status`-Antwort über tatsächlich vorhandene SkyMP-Chat-Registry; ohne Chat unverändert funktionsfähig.
7. **UI-Core-Adapter**: reales Status-Widget über bestätigten UI-Core-Vertrag; ohne UI Core unverändert funktionsfähig.
8. **Integration/Abnahme**: zwei Spieler, Neustarts, Disconnect, Berechtigung, I/O-Fehler, Lagspikes, Legacy-Kompatibilität.
9. **Abschlussbericht**: veränderte Dateien, echte Build-/Testkommandos und Ergebnisse, installierbare Artefakte, Pflicht-Patches in Fork/Launcher, bekannte Lücken und bewusst vertagte Features.

**Definition of Done:** Zwei gleichzeitig verbundene Spieler erhalten isolierte, serverseitig fortgeschriebene Charakterwerte; die Werte können zuverlässig gespeichert/geladen werden, sofern der reale Charakteridentitäts-/Persistenzvertrag existiert; Chat `/status` und das UI-Core-Widget zeigen dieselben Werte über ihre jeweils verifizierten optionalen APIs; deaktivierte oder fehlende Fremdplugins legen Metabolism nicht lahm. **Wenn ein unverzichtbarer SkyMP-Hook fehlt, diesen offen als noch nicht erfüllt markieren statt die Funktion zu simulieren.**
