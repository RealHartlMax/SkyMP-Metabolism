# Metabolism und Plugin Runtime Loader

Metabolism liefert ausschließlich serverautoritativ berechnete Zustände und registriert seine Oberfläche bei `globalThis.skympUi`. Deshalb deklariert das Plugin kein `runtime`-Feld und braucht keinen eigenen Client-/CEF-Download. UI-Core liefert sein signiertes Client-/UI-Paket über den generischen Loader des Gameservers. Die vorhandene optionale Chat-Integration und Plugin-Ladereihenfolge bleiben erhalten.

Voraussetzungen für den späteren gemeinsamen Test: Runtime-API-1-fähiger Launcher und Basis-Client, vertrauenswürdiger Herausgeberschlüssel für UI-Core, vollständig installiertes UI-Core-Plugin einschließlich Runtime sowie Gameserver-Neustart. Metabolism-Zustände, Charakter-Persistenz und Tick-Logik werden durch diesen Auslieferungswechsel nicht geändert. Kein Build, ZIP oder Ingame-Test in diesem Source-Auftrag.
