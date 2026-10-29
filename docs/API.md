# Server-API V1

`globalThis.skympMetabolism` ist eine eingefrorene, schreibgeschützte Referenz für
vertrauenswürdige Gamemode-Plugins im selben Node-Prozess. Kein Client-/CEF-RPC.
Die exportierten TypeScript-Verträge stehen in `src/api/contract.ts`, nach Build
unter `release/SkyMPMetabolism/types/api/contract.d.ts`.

```ts
const api = globalThis.skympMetabolism;
if (api?.apiVersion !== 1 || !api.getStatus().ready) return;
const state = api.getState(characterId);
const unsubscribe = api.onStateChange('my-jobs', (snapshot, changedStats) => {
  // Kopie, eingefroren; keine direkten Mutationen möglich.
});
await api.adjustStat(characterId, 'rest', -2, 'job', 'my-jobs');
unsubscribe();
```

`characterId` stammt aus einem bestätigten serverseitigen Character-Provider.
Der aktuelle native Adapter erzeugt `character:<uuid>` innerhalb von
`private.skympMetabolism`. Ein Server-Plugin mit bestätigter User↔Actor-Zuordnung
kann dort die ID lesen; Browserdaten oder bloße Nicknames sind keine Identität.
Das Beispiel `examples/consumer.ts` benötigt keinen internen Engine-Zugriff.

| Funktion | Vertrag |
| --- | --- |
| `getState(id)` | Immutable Kopie für aktive, überprüfte Charaktere; sonst `null` |
| `adjustStat(id,stat,delta,reason,owner?)` | Promise, Delta endlich und -100 bis 100, Ergebnis 0–100; lädt keine fremden/offline Charaktere |
| `registerConsumable(def)` | Validierte, eingefrorene Registry, keine Inventarwirkung |
| `unregisterConsumable(owner,key)` | Nur gleiche Owner-Attribution; andere Owner werden abgewiesen |
| `onStateChange(owner,handler)` | Unsubscribe-Funktion; nur echte Änderungen, Subscriber-Fehler isoliert |
| `getStatus()` | `ready`, `apiVersion`, `activeCharacters`, `persistenceMode`, `pendingSaves` |

Stats sind ausschließlich `satiety`, `hydration`, `rest`. Reasons sind `food`,
`drink`, `sleep`, `disease`, `job`, `admin`, `system`. `revision` steigt einmal je
tatsächlichem Zustandsupdate; Snapshots enthalten keine Speicherzeitmetadaten.
Online-Zeit wird vor einer Anpassung nachgeführt und kann daher ein eigenes
vorheriges Änderungsereignis auslösen. Ein unverändertes geclamptes Ergebnis
erzeugt selbst weder Revision noch Event.

`owner` ist ein Plugin-Namespace wie `my-jobs`, kein authentifiziertes
Sicherheitsmerkmal. Alle Gamemode-Plugins haben bereits vollständigen Serverzugriff.
Der optionale fünfte Parameter ermöglicht Audit-Attribution; ohne ihn wird
`trusted-server` protokolliert. Mutationen protokollieren UUID/Owner/Reason/Delta,
keine Namen, IP-Adressen oder Login-Token. Subscriber müssen beim eigenen Stop
ihre Unsubscribe-Funktion aufrufen. Asynchrone Subscriber sollen kurze Laufzeiten
haben; ihre Promises blockieren den Ticker nicht.

Mutationen/Lifecycle/Saves sind serialisiert. Standardmäßig maximal 120 Anpassungen
pro Charakter/Minute, 512 aktive bzw. noch zu sichernde Charaktere, 256 Consumables,
128 Subscriptions und 1024 wartende Operationen. Grenzwerte sind konfigurierbar.
Überlast, falsche Argumente, inaktive Identitäten und Speicherfehler führen zu
Exceptions/abgewiesenen Promises. Ein erfolgreiches `adjustStat` bedeutet Änderung
im Core; die Speicherung folgt Autosave/Disconnect/Shutdown.

Consumable-Schlüssel müssen den Namespace ihres Owners tragen, z.B.
`my-food:bread`. Effects sind nichtleere Teilmengen der drei Stats mit endlichen
Deltas von -100 bis 100; Cooldown 0–86400 Sekunden. Noch keine echten Item-IDs
werden vorinstalliert. Das Beispiel `fixture:bread` ist ein Testbezeichner und
kein Skyrim-Formular. Es gibt keinen frei aufrufbaren Konsum-/Schlafendpunkt.
