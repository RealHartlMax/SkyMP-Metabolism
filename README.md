# SkyMP Metabolism

> Plugin Runtime Loader (29.10.2026): Metabolism bleibt ein serverseitiger UI-Core-Consumer. Es registriert Daten/Widgets/Menüs über die vorhandene UI-Core-API und benötigt weder ein eigenes Runtime-Paket noch einen eigenen Launcher-/CEF-Build. Installiere UI-Core mit seinem signierten `Runtime/`-Verzeichnis und einmalig den generischen Runtime-API-1-Bootstrap. Details: [docs/PLUGIN_RUNTIME.md](docs/PLUGIN_RUNTIME.md). Keine neuen Builds oder ZIPs wurden für diese Quelländerung erzeugt.

Eigenständiges, serverautoritäres Gamemode-Plugin für Sättigung, Flüssigkeit und
Erholung. Alle Werte liegen zwischen 0 und 100: **höher ist besser**.
Standardtexte und Dokumentation sind Deutsch; `locales/de.json` und
`locales/en.json` liefern die Übersetzungen. Kein eigener Chat, kein CEF-Frontend.

```powershell
npm ci
npm run typecheck
npm test
npm run verify:fork
npm run verify:native
npm run verify:ui-load-order
```

Node.js 20 oder neuer. Die drei `verify`-Prüfungen benutzen den aktuellen lokalen
Fork unter `../skymp` beziehungsweise `SKYMP_FORK`. Die Kompatibilitätstests verwenden
`../SkyMP-Chat` und `../SkyMP-UI-Core`, abweichend über `SKYMP_CHAT`/`SKYMP_UI_CORE`.
Wenn ein Nachbarprojekt fehlt, werden genau dessen Tests ausdrücklich übersprungen.
Native Tests benötigen `build/dist/server/scam_native.node` und Skyrim-Serverdaten.
Die Load-Order-Prüfung startet beide echten Plugin-Bundles mit dem aktuellen
SkyMP-Loader ausdrücklich in alphabetischer Reihenfolge (Metabolism vor UI Core).

`npm run build` baut `dist/index.cjs`, API-Typen und den **entpackten** Ordner
`release/SkyMPMetabolism/`. Es gibt bewusst keinen ZIP-/Paketbefehl.
Den Ordner in das tatsächliche Server-Arbeitsverzeichnis unter
`Plugins/SkyMPMetabolism/` kopieren, im Dashboard aktivieren und den Gameserver
neu starten. Nicht in dieses Repository oder den temporären Loaderpfad speichern.

Der normale Modus verwendet die existierende SkyMP-SaveStorage. Eine neue UUID
wird im privaten Charakterdatensatz gespeichert; User-/Actor-IDs dienen nur dem
aktuellen Routing. `persistence.mode: "session-only"` ist ein ausdrücklich
gekennzeichneter Fallback mit Reset bei Reconnect. Ohne Chat und UI Core laufen
Ticker und Persistenz weiter. Mit kompatiblen APIs gibt es private `/status` und
`/metabolism` sowie drei beschriftete Statuszeilen im UI-Core-Widget.

Die Balance startet bei 100/100/100 mit 5/8/4 Punkten Abbau pro realer Online-Stunde,
30-Sekunden-Ticks und maximal 120 Sekunden Nachholen. Kein Offline-Abbau, Schaden
oder automatischer Tod. Unbekannte Konfiguration und nicht implementierte
Effekt-Flags werden abgewiesen.

**Offene Integrationspunkte:** Inventarverbrauch und Schlaf benötigen bestätigte
serverseitige Commit-Hooks. Die Registry erzeugt/verbraucht keine Items; Client-
Behauptungen ändern keine Werte. Debuffs sind bis zu einem sicheren Modifier-
Vertrag deaktiviert. Native Saves bestätigen die Übergabe an SaveStorage, keinen
fsync. Ein sichtbares HUD benötigt den separat installierten UI-Core-Client mit
Frontend-Protokoll 1. Ein echter Skyrim-/Zweiclient-Test steht noch aus.

Weitere Informationen: [Architektur und Audit](docs/ARCHITECTURE.md),
[Installation](docs/INSTALLATION.md), [API](docs/API.md),
[Integrationen](docs/INTEGRATIONS.md), [Persistenz](docs/PERSISTENCE.md),
[Balance](docs/BALANCING.md), [fehlende Fork-Hooks](docs/FORK_HOOKS.md) und
[Abnahmeplan](docs/ACCEPTANCE.md).
