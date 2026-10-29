# Abnahme und Prüfgrenzen

Automatisierte Ergebnisse werden nach Ausführung in `VALIDATION.md` festgehalten.
`artifacts/loader-validation.json` und `artifacts/native-validation.json` enthalten
Bundle-/Loader-Hashes und unterscheiden Fake-/Native-Runtime ausdrücklich.
Testwelten liegen ausschließlich unter diesem Repository in `artifacts/`.
Sie verändern weder die echte Serverwelt noch SkyMP-/Chat-/UI-Core-Quellen.

## Manueller Zweiclient-Plan (noch nicht durchgeführt)

1. Passenden echten SkyMP-/Skyrim-/Chat-/UI-Core-Clientstand protokollieren.
   Manifest im Dashboard erkennen, Safe-Mode prüfen, aktivieren, Ladereihenfolge
   setzen und Gameserver neu starten. Ohne Chat/UI Core ebenfalls starten.
2. Spieler A und B mit unterschiedlichen Profile-Actors anmelden. Private
   `/status`-/`/metabolism`-Antwort und drei Widgetzeilen müssen übereinstimmen;
   keine fremden Werte. DE/EN einschließlich 0-/100-Semantik prüfen.
3. 30-Sekunden-Abbau und 120-Sekunden-Cap beobachten. A abmelden, User-Slot mit B
   oder neuem Charakter belegen, A später anmelden. UUID/Werte müssen den
   Charakter begleiten; offline kein Abbau. Serverneustart und reale
   Multicharacter-Auswahl gesondert prüfen, falls ein neuer Character-Provider
   installiert ist.
4. Über ein vertrauenswürdiges Test-Serverplugin Werte an Schwellen bringen.
   Nur Übergangsmeldungen, Hysterese und Cooldowns. Reconnect mit niedrigem
   Zustand darf keine Warnungsflut erzeugen. Keine Produktions-Admincommands.
5. Chat Enter/Escape, Skyrim-Inventar/Karte/Dialog/Konsole, UI-Modals/Fokus,
   YACA-Sprachfunktionen, Health/Stamina/Magicka sowie Tod/Respawn prüfen.
   Keine neuen Hotkeys und keine ungefragten Resets.
6. Langsamer CEF-Start, UI-Reload, Reconnect, Charakterwechsel, fehlender oder
   veralteter UI-Core-Client: initialer Snapshot korrekt bzw. verständliche
   UI-Core-Diagnose; Core läuft weiter. Commands anderer Plugins bleiben erhalten.
7. Kontrollierter Stop und Neustart mit gespeicherten Zuständen. I/O-Fehler in
   isolierter Testwelt auslösen; keine Default-Überschreibung, Wiederholung nach
   Reparatur. Harter Kill ist wegen fehlendem Commit-ACK ausdrücklich kein
   garantierter verlustfreier Shutdown.

## Noch nicht abnahmefähig

- Essen/Trinken aus realem Inventar, bestätigter Item-Use-Commit, Crash-/Replay-
  sichere Kopplung an den Itemabzug: fehlender Fork-Hook.
- Schlaf/Bett/Herberge: fehlender verifizierter Provider.
- Debuffs/Schaden/Tod: absichtlich deaktiviert bis zu sicherer Effektkomposition.
- Sichtbares Skyrim-/CEF-HUD, echte Zweispieler-/YACA-/Input-/Gameplay-Regressionen:
  keine Spielsession in diesem Auftrag durchgeführt.

Das Projekt ist lokal baubar und als entpacktes Server-Plugin prüfbar. Die gesamte
AGENTS.md-Ingame-Definition-of-Done wird nicht als erfüllt ausgegeben, solange
diese Punkte offen sind. Keine ZIPs, Veröffentlichung, Installation auf einem
produktiven Server oder Client-Rollouts durch diesen Auftrag.
