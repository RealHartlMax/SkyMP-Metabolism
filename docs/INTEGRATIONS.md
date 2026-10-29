# Integrationen

Lokale Schnittstellenprüfung und Versionen: siehe `ARCHITECTURE.md`.

## SkyMP

Ein gemeinsamer Timer pro Runtime prüft alle Sekunde die nativen Verbindungen
und treibt den 30-Sekunden-Abbau sowie Autosave/UI-Drosselung an. Es werden keine
Timer pro Charakter und keine Client-Event-Sources erzeugt. `connect` wird erst
nach erfolgreichem `isConnected` und beidseitigem `getUserActor/getUserByActor`
zu einem Charakter. Beim Boot werden die durch `maxPlayers` bestimmten nativen
User-Slots einmal überprüft. Danach nur bekannte Verbindungen.

`disconnect` sperrt das Routing sofort und stößt den finalen Save an. Charakter-
wechsel werden durch den Zuordnungsabgleich erkannt (standardmäßig bis eine
Sekunde Verzögerung). Eine User-ID wird nicht als Character-ID gespeichert.
Fehlerhafte Profile, ungültige Saves und Doppel-UUIDs auf gleichzeitig gebundenen
Actors sperren die betroffene Zuordnung. Kein Eingriff in `onItemPickupAttempt`,
Papyrus-Handler, `isDead`, `canRespawn`, `inventory`, Wetter oder `actorValues`.
Private Properties brauchen im geprüften Fork keine `makeProperty`-Registrierung.
Das bleibt auch nach `mp.clear()` gültig. Vollständigen Plugin-Neustart trotzdem
über den Gameserver ausführen; kein Plugin-Hot-Reload wird versprochen.

Die native API bietet kein `removeListener`. Ein geteilter WeakMap-Dispatcher
hält höchstens einen nativen Listener je Lifecycle-Event/Serverinstanz; Stop
entfernt den Runtime-Subscriber. Eine erneute Runtime fügt keinen nativen
Listener hinzu. Wo `removeListener` verfügbar ist, wird zusätzlich physisch
abgemeldet. Ein zweiter temporärer Require des Plugin-Entrys nutzt denselben
Runtime-Schlüssel und startet keinen zweiten Scheduler.

## SkyMP Chat 1.2.0, API 1

Verwendet werden die tatsächlich implementierten `registerCommand`,
`unregisterCommand`, `sendToPlayer` und serverseitigen `ctx.userId/actorId/locale`,
`ctx.reply/error`. `/status` (konfigurierbar) und `/metabolism` werden als normale
Fremdplugin-Commands registriert. Die echte Registry prüft atomar auch verborgene
Befehle und Aliasse. Bei Kollision bleibt der vorhandene Command erhalten, ein
anderer verfügbarer Metabolism-Command kann weiter funktionieren. Keine fremden
Commands werden überschrieben, keine Permissions ersetzt, kein Admin-Command.

Antworten sind ausschließlich privat. Die Zuordnung wird bei Ausführung erneut
validiert; abgefangene fremde Actor-/User-IDs geben keinen fremden Zustand preis.
Die Sprache folgt `ctx.locale`, ersatzweise der Metabolism-Konfiguration.
Warnungen gehen bevorzugt an UI Core, ersatzweise privat an Chat. Fehlender Chat
verhindert weder Abbau noch Speicherung. Load Order ist erforderlich: spätes
Nachladen ohne Gameserver-Neustart wird nicht versprochen.

## UI Core 1.0.0, API/Frontend-Protokoll 1

Owner `skymp-metabolism`, Widget-ID `skymp-metabolism:status`, Typ `icon-list`.
Die vorgeschlagene ID `metabolism:status` verletzt den realen Owner-Vertrag und
wird deshalb nicht verwendet. Drei Zeilen liefern Beschriftung, konkrete
0-/100-Semantik, Zahl und Zustand. Echte separate Tooltip-Felder oder drei
Progressbalken in einem Widget kennt V1 nicht; keine erfundenen Felder und kein
neues CEF-Frontend. Die Hinweise stehen lesbar in den Zeilenbeschriftungen.

Bei Charakterbereitschaft wird initial geliefert, danach höchstens alle fünf
Sekunden bei Änderungen, unveränderte Daten alle 30 Sekunden als TTL-Erneuerung.
UI Core hält die Werte für seinen Ready-/Reconnect-Snapshot bereit. Daten
enthalten keine Character-ID oder Admininformationen. Nur der aktuell bestätigte
Empfänger wird aktualisiert. Beim Wechsel wird Sichtbarkeit neu initialisiert,
beim Stop ausschließlich die eigene Registrierung entfernt. Notifications kommen
nur bei Schwellenwechsel mit Hysterese/Cooldown; fehlende/defekte API wird isoliert.
Kein Metabolism-Fokus-/Hotkey-/Browser-Message-Handler.

Beim Boot wird die UI-Core-Service-Referenz frisch gelesen. Wenn UI Core später
geladen wird oder seine API erst bereit werden muss, versucht Metabolism über
den vorhandenen Scheduler höchstens einmal je Sekunde und bis zu 30 Sekunden
erneut anzubinden (maximal 31 Prüfungen). Danach endet die Suche; der Core rechnet
weiter. Erfolgreiche Anbindung initialisiert auch bereits aktive Charaktere mit
ihrem aktuellen Snapshot. Kein neuer Timer und keine dauerhafte Polling-Schleife.
Eine inkompatible Version oder eine Widget-Kollision bleibt geschlossen.

Diagnosen unterscheiden fehlendes `globalThis.skympUi`, API-Version, fehlende
Methoden, `getStatus()`-Fehler, Protokollversion und `ready=false`. Erfolg meldet
`UI Core connected: API v1, frontend protocol v1`. Empfohlen bleibt UI Core vor
Metabolism zu laden. Diese Startbehandlung ist kein Plugin-Hot-Reload.

Die frühere Sammelmeldung `UI Core API/protocol v1 unavailable` entstand beim
serverseitigen API-Check. Sie bestätigt für sich allein weder die Aktivierung
von UI Core noch dessen konkrete Version. Ohne `pluginsLoadOrder` sortiert der
Loader alphabetisch: `skymp-metabolism` kommt vor `skymp-ui-core`. Die frühere
einmalige Prüfung hat dann das später verfügbare UI Core dauerhaft verpasst.
`npm run verify:ui-load-order` prüft genau diesen Fall gegen den echten Loader.

Die lokalen Kompatibilitätstests kompilieren `SkyMP-UI-Core/src/runtime.ts`
unmittelbar und verwenden die reale Chat-Registry, keine kopierten Annahmen.
Das prüft Serververträge; Rendering/CEF/Input/YACA müssen im Spiel abgenommen
werden. UI Core benötigt weiterhin seinen getrennten Client-/CEF-Rollout.
