# Lokale Installation und Betrieb

1. Node.js >=20 bereitstellen. Im Metabolism-Repository `npm ci`, danach
   `npm run typecheck`, `npm test` und die gewünschten Fork-Prüfungen ausführen.
2. `release/SkyMPMetabolism/` als entpackten Ordner in
   `<tatsächliches Server-cwd>/Plugins/SkyMPMetabolism/` kopieren. Eine Installation
   in ein fremdes Repository wurde in diesem Auftrag nicht automatisch vorgenommen.
   Build erzeugt keine Archive und überschreibt eine vorhandene lokale
   `release/SkyMPMetabolism/config.json` nicht.
3. `config.json` und die beiden Dateien unter `locales/` prüfen. Ohne `config.json`
   gelten sichere Defaults. Alternativer expliziter Configpfad:
   `SKYMP_METABOLISM_CONFIG`, relativ zu `process.cwd()` oder absolut. Locale-
   Overrides werden aus `locales` neben dieser Config geladen. Kein Runtime-Zugriff
   auf temporäres `__dirname` und keine externen npm-Laufzeitabhängigkeiten.
4. Im Dashboard unter Ressourcen → Server-Plugins die Discovery/Freigabe prüfen.
   Neue Plugins bleiben im Safe-Modus zunächst deaktiviert. Nach erstmaliger
   Erkennung aktivieren und den Gameserver neu starten. Kein kompletter VPS-
   Neustart nötig. Dashboard-/Backend-Quellen werden hier nicht verändert.
5. Falls installiert, optionale Dienste vorher laden:

```json
{
  "pluginsLoadOrder": ["skymp-ui-core", "skymp-chat", "skymp-metabolism"]
}
```

Die Liste enthält Plugin-IDs aus den Manifesten. Bestehende weitere Plugins in
ihrer benötigten Reihenfolge erhalten; YACA benötigt keinen Metabolism-Eintrag.
Keine automatische Loader-Abhängigkeitsprüfung. Ohne die beiden optionalen
Dienste bleiben Engine und Datenhaltung einsatzfähig.

UI Core wird beim Boot bis zu 30 Sekunden nachträglich erkannt, falls es später
startet. Die ausdrückliche Reihenfolge bleibt empfohlen. Im Serverlog muss das
UI-Core-Plugin selbst `Ready: API v1, frontend protocol v1` melden. Fehlt diese
Zeile, dessen Installation, Aktivierung und vorhergehende Startfehler prüfen.
Metabolism bestätigt die Anbindung mit `UI Core connected: API v1, frontend
protocol v1`. Die Suche endet nach dem Startfenster; ein UI-Core-Plugin, das erst
viel später aktiviert/installiert wird, benötigt einen Gameserver-Neustart.

Zur Korrektur der bisherigen einmaligen Startprüfung genügt das aktualisierte
`release/SkyMPMetabolism/index.cjs` im vorhandenen Pluginordner. Eigene
`config.json`-/Locale-Anpassungen erhalten. Danach den Gameserver neu starten.
Die VPS-Einstellungen wurden hier nicht ausgelesen oder geändert.

Die Metabolism-Info `persistence=native; native DB commit acknowledgement
unavailable` bedeutet: Native SaveStorage ist der gewählte Speicheradapter;
die native API bietet keine Bestätigung eines dauerhaften DB-Commits. Das ist
keine vom Plugin gemeldete fehlgeschlagene Speicherung. Echte Fehler werden
gesondert als Load-/Autosave-/Disconnect-Fehler protokolliert.

Vorhandene Welt-SaveStorage muss im normalen Gameserver angeschlossen sein; der
geprüfte Fork tut dies vor Pluginstart. Metabolism ruft `attachSaveStorage` nicht
erneut auf und startet keine konkurrierende Datenbank.

Kompatibilität des Server-Bundles: Metabolism Manifest/API 1.0.0/V1, lokal geprüfter
SkyMP-Quellstand laut `ARCHITECTURE.md`, Chat 1.2.0/API 1, UI Core 1.0.0/API 1 und
Frontend-Protokoll 1. UI Core hat einen eigenen Client-/CEF-Build, der separat
über Launcher/Modpack installiert werden muss. Metabolism selbst verteilt kein
Frontend. Versionen/Dateien eines bereits laufenden Clients müssen unabhängig
von Server-Quellen verifiziert werden.

Nach Änderung von Server-Plugin, Load Order, Konfiguration oder Katalogen den
Gameserver neu starten. Eine ausschließlich geänderte UI-Core-Clientintegration
braucht deren gesonderten Build/Rollout und Client-Neustart. Kein Live-Hot-Reload.

Deaktivieren: `enabled=false` konfigurieren und Gameserver neu starten oder im
Dashboard für den nächsten Start deaktivieren. Beim kontrollierten Runtime-Stop
werden Timer, Commands und die eigene Widget-Registrierung entfernt. Das Plugin
hat keine ActorValue-Änderungen zurückzunehmen. Vorhandene Charakterdaten bleiben
für spätere Aktivierung erhalten.
