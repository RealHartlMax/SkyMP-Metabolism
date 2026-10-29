# Isolierte Erweiterungsvorschläge für den SkyMP-Fork

Diese Datei ist eine konkrete Schnittstellenplanung, kein bereits implementierter
Hook und kein im Auftrag angewendeter Core-Patch. Fremde Repositories bleiben
unverändert. Vor einem Patch sind native Unit-Tests plus Spieltest notwendig.

## Autoritativer Item-Commit

Eingriffspunkt: `skymp5-server/cpp/server_guest_lib/MpActor.cpp::OnEquip` nach dem
erfolgreichen `RemoveItem(baseId,1,...)`, nur für konsumierte ALCH/INGR-Items.
`ActionListener::OnEquip` hat den Actor bereits über die native Verbindung
ermittelt. Ein JS-Signal darf nicht direkt aus der Client-Nachricht stammen.

Vorgeschlagener neuer Native-Eventvertrag (noch nicht verfügbar):

```ts
mp.on('consumableCommitted', (event: {
  actorId: number;
  itemBaseId: number;
  consumedCount: 1;
  transactionId: string; // vom Server erzeugt, nachweislich einmaliger Commit
}) => {});
```

Kein erneutes Abbuchen in Metabolism, weil der Native-Commit das Item bereits
verbraucht hat. Vor Einbau müssen Replay-ID, wirklich erfolgreicher Abzug und
Fehlerverhalten überprüft werden. Für genau-einmal auch über Prozessabstürze
braucht es ein gemeinsames Persistenz-/Outbox-Protokoll zwischen Inventar-Commit,
Metabolism-State und Transaktionsmarker. Ein beliebiges post-hoc Browser-/Equip-
Signal genügt nicht. Tests: Bestand 0, ungültige ESPM-Typen, duplizierte Pakete,
zwei gleichzeitige Uses, Fehler nach Abzug, Neustart mit ausstehendem Commit.

Die heutige Registry bleibt bis dahin geschlossen: kein `/feed`, `/drink` oder
frei erreichbarer Konsum-Aufruf. Beispiel-Form-IDs werden nicht geraten.

## Verifizierte Ruhe

Benötigt einen autoritativen Interaktions-/Bett-Provider mit bestätigtem Actor,
realem Objekt, Welt/Zelle, Distanz, Permissions und serverseitig gemessener
Dauer. Client-Sleep-/Zeitangaben allein sind ungültig. Ein künftiger Provider
kann nach erfolgreicher Transaktion `adjustStat(...,'rest',delta,'sleep',owner)`
aufrufen. Für V1 gibt es weder erfundene Bett-Hooks noch Rest-Commands.

## Dauerhafter Save-Flush

Ein neues `flushSaveStorage(): Promise<...>` müsste die aktuellen ChangeForms
einschließlich noch nicht an den Saver-Thread übergebener Änderungen einreichen
und den dauerhaften DB-Commit bestätigen. Der Gameserver muss diesen Vertrag
vor Beenden seines Tick-Loops abwarten. Fehler/Timeouts dürfen keinen Erfolg
melden. Aktuell existiert kein entsprechender JavaScript-Export.

## Effekte

Vor eigenen Debuffs eine Owner-/Source-basierte Komposition über die vorhandenen
ActorValues vorsehen, einschließlich Magie, Heilern, Krankheiten und Tod/Respawn.
Das bloße Wiederherstellen eines früher gelesenen `staminaRateMult` kann fremde
Änderungen löschen und ist deshalb kein implementierter MVP-Debuff.
