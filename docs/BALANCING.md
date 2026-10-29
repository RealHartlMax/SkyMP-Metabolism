# Balance und Konfiguration

Defaults sind RP-Startannahmen und keine Realismussimulation.

| Wert | Initial | Abbau je realer Online-Stunde | Bedeutung 0 / 100 |
| --- | --- | --- | --- |
| `satiety` | 100 | 5 | ausgehungert / satt |
| `hydration` | 100 | 8 | dehydriert / gut versorgt |
| `rest` | 100 | 4 | erschöpft / ausgeruht |

Ein normaler 30-Sekunden-Tick zieht etwa 0,0417 / 0,0667 / 0,0333 Punkte ab.
Keine Verbindung oder kein bestätigter Player-Actor: kein Abbau. Offline-Epochs
dienen nicht zur Nachberechnung. Reale monotone Millisekunden treiben die Engine;
Skyrim-Spielzeit, CEF-FPS und Systemuhrsprünge haben keinen Einfluss auf den Abbau.
Unix-Epoch-Metadaten stammen separat aus `Date.now()`.

Ein Nachholschritt zählt höchstens 120 Sekunden. Überschüssige Zeit nach Lag oder
Rechner-Schlaf wird verworfen. Ein doppelter Tick zur selben Zeit ändert nichts.
Bei Disconnect/Stop wird noch nicht getickte Online-Zeit bis zum Ereignis mit
demselben Cap berücksichtigt. Nach Reconnect beginnt die monotone Basis neu.

Schwellen: Warnung bei <=50, kritisch <=25, sehr kritisch <=10. Verschlechterung
wird sofort eingestuft. Erholung braucht mindestens +3 Punkte über der verlassenen
Grenze, z.B. Warnung→gut erst bei 53. Meldungen nur bei echten Wechseln und
maximal einmal je Stat in 60 Sekunden. Innerhalb des Cooldowns unterdrückte
Meldungen werden nicht nachträglich als Tick-Flut versendet. Gespeicherte niedrige
Werte starten mit richtiger Stufe, ohne bei jedem Reconnect Warnungen zu erzeugen.

`enabled=false` legt keine neuen Zustände an, registriert kein HUD/Commands und
startet keinen Timer. Neustart ist für Konfigurationsänderungen erforderlich.
Keine Debuffs, kein Schaden, kein Tod im MVP; `enabled=true` für diese drei
Teilfunktionen ist ein Konfigurationsfehler, bis ein sicherer Adapter existiert.
Respawn setzt Metabolism-Werte nicht zurück.

`config/config.example.json` enthält alle Einstellungen. Unbekannte Schlüssel,
String-Zahlen, NaN/Infinity, negative Raten und falsche Typen werden abgewiesen.
Tick 1–3600 s, Catch-up mindestens Tickdauer und höchstens 3600 s, Lifecycle-Poll
0,1–5 s (höchstens Tickdauer), Abbauraten 0–100/h, Initialwerte 0–100,
Autosave 1–3600 s, UI-Updates 1–30 s. Keine unbeschränkten Zeit-/Spielerlimits.

Sprache: `locale: "de"` oder `"en"`; individuelle Chatantworten folgen der
Chat-Sprache. Im Pluginordner können `locales/de.json` und `locales/en.json`
angepasst werden. Fehlende Dateien/Schlüssel verwenden die gebündelten Texte,
ungültige Kataloge werden abgewiesen. Netzwerkwerte bleiben canonical; es wird
keine interne Hunger-/Durst-/Müdigkeits-Inversion geführt. Ein künftiger
Anzeigeadapter kann diese Größen als `100 - canonicalValue` berechnen.

Für beschleunigte Tests eine injizierte Fake-Clock verwenden. Produktionswerte
nicht zur Simulation auf extreme Abbauraten umstellen.
