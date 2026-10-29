'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createMetabolism, createFakeClock, NativePersistenceAdapter, NATIVE_PROPERTY, ConsumableRegistry, ItemUseAdapter, inspectUiApi } = require('../dist/library.cjs');
const { FakeMp, fakeUi, fixture, quiet } = require('./helpers.cjs');
test('native UUID/state follows the character through disconnect, user-slot reuse and restart', async () => {
  const { mp, clock, runtime, id } = await fixture(); const a = id(101), b = id(102); assert.notEqual(a, b);
  await runtime.api.adjustStat(a, 'satiety', -30, 'job'); clock.advance(10000); mp.disconnect(0); await runtime.pump();
  const saved = mp.get(101, NATIVE_PROPERTY); assert(saved.state.satiety < 70); assert.equal(runtime.api.getState(a), null);
  mp.addActor(103, 30); mp.connect(0, 103); await runtime.pump(); const c = id(103); assert.notEqual(c, a); assert.equal(runtime.api.getState(c).satiety, 100);
  mp.disconnect(0); await runtime.pump(); clock.advance(86400000); mp.connect(5, 101); await runtime.pump(); assert.equal(id(101), a);
  assert.equal(runtime.api.getState(a).satiety, saved.state.satiety); await runtime.stop();
  const restarted = createMetabolism(mp, { clock, log: quiet, config: { chat: { enabled: false }, ui: { enabled: false } } }); await restarted.pump();
  assert.equal(restarted.api.getState(a).satiety, saved.state.satiety); assert.equal(restarted.api.getState(b).satiety, 100 - 5 * 120 / 3600); await restarted.stop();
});
test('native connect before spawn, duplicate connect and character switch do not duplicate sessions', async () => {
  const mp = new FakeMp(), clock = createFakeClock(); mp.connect(0); mp.addActor(101, 10); mp.addActor(102, 10);
  const r = createMetabolism(mp, { clock, log: quiet }); await r.pump(); assert.equal(r.api.getStatus().activeCharacters, 0);
  mp.switchActor(0, 101); await r.pump(); const a = mp.get(101, NATIVE_PROPERTY).characterId;
  mp.emit('connect', 0); await r.pump(); assert.equal(r.api.getStatus().activeCharacters, 1);
  await r.api.adjustStat(a, 'rest', -25, 'job'); mp.switchActor(0, 102); await r.pump(); const b = mp.get(102, NATIVE_PROPERTY).characterId;
  assert.notEqual(a, b); assert.equal(r.api.getState(a), null); assert.equal(r.api.getState(b).rest, 100);
  mp.switchActor(0, 101); await r.pump(); assert.equal(r.api.getState(a).rest, 75); await r.stop();
});
test('invalid persisted records and changed profile ownership fail closed without reset', async () => {
  const { mp, runtime, id } = await fixture(); const a = id(101); await runtime.stop();
  const envelope = mp.get(101, NATIVE_PROPERTY); envelope.state.schemaVersion = 5; mp.set(101, NATIVE_PROPERTY, envelope);
  const r = createMetabolism(mp, { log: quiet }); await r.pump(); assert.equal(r.api.getState(a), null);
  assert.equal(mp.get(101, NATIVE_PROPERTY).state.schemaVersion, 5); await r.stop();
  mp.actors.get(101).profileId = 999; const storage = new NativePersistenceAdapter(mp); assert.throws(() => storage.bind(101), /ownership/);
});
test('private native envelopes validate revision and reject copied UUID records', async () => {
  const mp = new FakeMp(); mp.addActor(101, 10); mp.addActor(102, 10);
  const storage = new NativePersistenceAdapter(mp), a = storage.bind(101);
  mp.set(102, NATIVE_PROPERTY, mp.get(101, NATIVE_PROPERTY)); assert.throws(() => storage.bind(102), /Duplicate/);
  await assert.rejects(storage.save({ schemaVersion: 1, characterId: a, revision: 1, satiety: 50, hydration: 50, rest: 50, lastPersistedAt: 1000 }, 1), /conflict/);
});
test('missing optional plugins and forged CEF packets leave core rules intact', async () => {
  const { mp, clock, runtime, id } = await fixture(); const a = id(101), before = runtime.api.getState(a);
  mp.emit('customPacket', 0, JSON.stringify({ characterId: a, action: 'adjustStat', stat: 'rest', delta: 100, isAdmin: true, itemConsumed: true }));
  assert.deepEqual(runtime.api.getState(a), before); clock.advance(30000); await runtime.pump(); assert(runtime.api.getState(a).hydration < 100);
  assert.equal(mp.output.length, 0); await runtime.stop();
});
test('session-only mode is explicit, supports missing native storage, and resets on reconnect', async () => {
  const mp = new FakeMp(), clock = createFakeClock(); mp.addActor(101, -1); mp.connect(0, 101); mp.get = undefined; mp.set = undefined;
  const warnings = []; const r = createMetabolism(mp, { clock, config: { persistence: { mode: 'session-only' } }, log: { ...quiet, warn: x => warnings.push(x) } });
  await r.pump(); assert.equal(r.api.getStatus().persistenceMode, 'session-only'); assert.equal(r.api.getStatus().activeCharacters, 1);
  assert(warnings.some(s => s.includes('SESSION-ONLY'))); mp.disconnect(0); await r.pump(); mp.connect(0, 101); await r.pump();
  assert.equal(r.api.getStatus().activeCharacters, 1); await r.stop();
});
test('UI uses three private values, throttles snapshots, renews TTL and cleans its registration', async () => {
  const ui = fakeUi(), { mp, clock, runtime, id } = await fixture({ uiApi: ui }, { ui: { enabled: true } });
  assert.equal(ui.definitions.size, 1); assert(ui.definitions.has('skymp-metabolism:status'));
  const a = id(101); const initial = ui.updates.filter(u => u.userId === 0).at(-1); assert.equal(initial.state.items.length, 3);
  assert(!JSON.stringify(initial.state).includes(a)); assert(initial.state.items[0].label.includes('100 = satt'));
  await runtime.api.adjustStat(a, 'satiety', -10, 'job'); await runtime.pump(); assert.equal(ui.updates.filter(u => u.userId === 0).length, 1);
  clock.advance(5000); await runtime.pump(); assert.equal(ui.updates.filter(u => u.userId === 0).at(-1).state.items[0].value.split('/')[0], '90,0');
  assert.equal(ui.updates.filter(u => u.userId === 1).length, 1);
  clock.advance(30000); await runtime.pump(); assert(ui.updates.filter(u => u.userId === 1).length >= 2);
  mp.disconnect(0); await runtime.pump(); assert(ui.visibility.some(v => v.userId === 0 && !v.visible)); await runtime.stop(); assert.equal(ui.definitions.size, 0);
});
test('optional API version mismatch and provider exceptions never stop the core', async () => {
  const ui = { ...fakeUi(), apiVersion: 2 };
  const { runtime, id } = await fixture({ uiApi: ui, chatApi: { apiVersion: 2 } }, { ui: { enabled: true }, chat: { enabled: true } });
  assert.equal(ui.definitions.size, 0); assert(runtime.api.getState(id(101))); await runtime.stop();
  const broken = fakeUi(); broken.updateWidget = () => { throw Error('offline UI'); };
  const second = await fixture({ uiApi: broken }, { ui: { enabled: true } }); await second.runtime.pump(); assert.equal(second.runtime.api.getStatus().activeCharacters, 2); await second.runtime.stop();
});
test('stop accounts final online time and repeated lifecycle calls do not duplicate handlers', async () => {
  const { mp, clock, runtime, id } = await fixture(); const a = id(101); runtime.start(); runtime.start();
  assert.equal(mp.listenerCount('connect'), 1); clock.advance(15000); await runtime.stop(); await runtime.stop();
  const state = mp.get(101, NATIVE_PROPERTY).state; assert.equal(state.characterId, a); assert(state.rest < 100);
  assert.equal(mp.listenerCount('connect'), 0); assert.equal(mp.listenerCount('disconnect'), 0); assert.equal(runtime.api.getStatus().ready, false);
  const disabled = createMetabolism(mp, { config: { enabled: false }, log: quiet }); await disabled.pump(); assert.equal(mp.listenerCount('connect'), 0); await disabled.stop();
});
test('consumables enforce namespace/ownership/limits; missing consumption hook rejects every request', async () => {
  const registry = new ConsumableRegistry(1), def = { owner: 'food', key: 'food:bread', itemId: 'fixture:bread', effects: { satiety: 10 } };
  registry.register(def); def.effects.satiety = 99; assert.equal(registry.list()[0].effects.satiety, 10);
  assert.throws(() => registry.register({ ...def, key: 'food:other' }), /limit/);
  assert.throws(() => registry.unregister('other', 'food:bread'), /owner/);
  for (const patch of [{ effects: { satiety: NaN } }, { effects: { rest: '10' } }, { effects: { bad: 3 } }, { cooldownSeconds: -1 }, { owner: 'bad:owner' }])
    assert.throws(() => new ConsumableRegistry().register({ ...def, ...patch }));
  const adapter = new ItemUseAdapter();
  for (const request of [null, {}, { actorId: 101, count: -1 }, { itemConsumed: true, isAdmin: true }]) assert.deepEqual(await adapter.consume(request), { accepted: false, code: 'no-hook' });
});
test('native API without removeListener reuses one dispatcher across stopped runtime instances', async () => {
  const mp = new FakeMp(); mp.removeListener = undefined;
  for (let i = 0; i < 3; i++) {
    const r = createMetabolism(mp, { log: quiet }); await r.pump(); assert.equal(mp.listenerCount('connect'), 1); assert.equal(mp.listenerCount('disconnect'), 1);
    await r.stop();
  }
  mp.connect(0); mp.disconnect(0); assert.equal(mp.listenerCount('connect'), 1);
});
test('synchronous exit handoff writes final native state without relying on a Promise callback', async () => {
  const { runtime, mp, clock, id } = await fixture(); const a = id(101); clock.advance(12000); runtime.submitExit();
  const saved = mp.get(101, NATIVE_PROPERTY).state; assert.equal(saved.characterId, a); assert(saved.rest < 100); assert.equal(saved.lastPersistedAt, clock.wallNow());
  await runtime.stop();
});
test('UI Core loaded after Metabolism receives the current snapshots without a Metabolism restart', async () => {
  let service;
  const { runtime, clock, id } = await fixture({ getUiApi: () => service }, { ui: { enabled: true } });
  try {
    const a = id(101); await runtime.api.adjustStat(a, 'satiety', -20, 'job');
    service = fakeUi(); clock.advance(1000); await runtime.pump();
    assert.equal(service.definitions.size, 1, 'Later UI Core must be discovered');
    assert.equal(service.updates.filter(p => p.userId === 0).at(-1).state.items[0].value.split('/')[0], '80,0');
    assert.equal(service.updates.filter(p => p.userId === 1).at(-1).state.items[0].value.split('/')[0], '100,0');
    await runtime.pump(); assert.equal(service.definitions.size, 1);
  } finally { await runtime.stop(); }
  assert.equal(service.definitions.size, 0);
});
test('UI diagnostics distinguish missing service, incompatible API/protocol, missing methods and status errors', () => {
  assert.match(inspectUiApi(undefined).reason, /skympUi is missing/);
  assert.match(inspectUiApi({ ...fakeUi(), apiVersion: 2 }).reason, /apiVersion=2/);
  const wrongProtocol = fakeUi(); wrongProtocol.getStatus = () => ({ ready: true, apiVersion: 1, frontendProtocol: 2 });
  assert.match(inspectUiApi(wrongProtocol).reason, /frontendProtocol=2/); assert.equal(inspectUiApi(wrongProtocol).api, null);
  const missingMethod = fakeUi(); delete missingMethod.notify; assert.match(inspectUiApi(missingMethod).reason, /missing methods: notify/);
  const brokenStatus = fakeUi(); brokenStatus.getStatus = () => { throw Error('token=secret'); };
  assert.match(inspectUiApi(brokenStatus).reason, /getStatus\(\) threw/); assert(!inspectUiApi(brokenStatus).reason.includes('secret'));
});
test('UI Core readiness can recover during boot and reports the transition once', async () => {
  const service = fakeUi(); let ready = false; const messages = [];
  service.getStatus = () => ({ ready, apiVersion: 1, frontendProtocol: 1 });
  const { runtime, clock } = await fixture({ getUiApi: () => service, log: { ...quiet, warn: m => messages.push(m), info: m => messages.push(m) } }, { ui: { enabled: true } });
  try {
    assert.equal(service.definitions.size, 0); assert(messages.some(m => m.includes('ready=false')));
    ready = true; clock.advance(1000); await runtime.pump(); assert.equal(service.definitions.size, 1);
    clock.advance(1000); await runtime.pump(); assert.equal(messages.filter(m => m.includes('UI Core connected')).length, 1);
  } finally { await runtime.stop(); }
});
test('absent UI discovery stops after its bounded boot window and never starts another timer', async () => {
  let reads = 0; const warnings = [];
  const { runtime, clock } = await fixture({ getUiApi: () => { reads++; return undefined; }, log: { ...quiet, warn: m => warnings.push(m) } }, { ui: { enabled: true } });
  try {
    for (let i = 0; i < 31; i++) { clock.advance(1000); await runtime.pump(); }
    const finalReads = reads; assert(finalReads <= 31); assert.equal(warnings.filter(m => m.includes('discovery ended')).length, 1);
    clock.advance(3600000); await runtime.pump(); assert.equal(reads, finalReads); assert.equal(runtime.api.getStatus().activeCharacters, 2);
  } finally { await runtime.stop(); }
});
