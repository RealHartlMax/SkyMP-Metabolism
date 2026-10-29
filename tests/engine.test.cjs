'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createMetabolismEngine, MemoryAdapter, createFakeClock } = require('../dist/library.cjs');
const { quiet } = require('./helpers.cjs');
function setup(extra = {}) {
  const clock = createFakeClock(), persistence = new MemoryAdapter();
  const engine = createMetabolismEngine({ clock, persistence, log: quiet, ...extra });
  return { clock, persistence, engine };
}
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
test('two characters decay deterministically, duplicate joins/ticks do not reset or double count', async () => {
  const { clock, engine } = setup(); await Promise.all([engine.loadCharacter('a'), engine.loadCharacter('a'), engine.loadCharacter('b')]);
  await engine.adjustStat('a', 'rest', -5, 'job'); clock.advance(30000); await engine.tick();
  const a = engine.getState('a'), b = engine.getState('b'); near(a.satiety, 100 - 5 / 120); near(a.rest, 95 - 4 / 120); near(b.rest, 100 - 4 / 120);
  assert.equal(engine.getStatus().activeCharacters, 2); await engine.tick(); assert.deepEqual(engine.getState('a'), a);
  clock.advance(3600000); await engine.tick(); near(engine.getState('a').hydration, 100 - 8 * 150 / 3600);
  await engine.stop();
});
test('disconnect saves partial online time; reconnect ignores offline time and preserves revisions', async () => {
  const { clock, engine, persistence } = setup(); await engine.loadCharacter('a'); clock.advance(10000); await engine.unloadCharacter('a');
  const saved = await persistence.load('a'); near(saved.rest, 100 - 4 * 10 / 3600); assert.equal(saved.lastPersistedAt, clock.wallNow());
  clock.advance(86400000); await engine.loadCharacter('a'); near(engine.getState('a').rest, saved.rest);
  assert.equal(engine.getState('a').revision, saved.revision); await engine.stop();
});
test('serial changes cannot race; snapshots and changed-stat arrays cannot mutate core state', async () => {
  const { engine } = setup(); await engine.loadCharacter('a'); const seen = [];
  engine.onStateChange('test-owner', (s, changed) => { seen.push(s); changed.length = 0; });
  await Promise.all(Array.from({ length: 30 }, () => engine.adjustStat('a', 'satiety', -1, 'job', 'test-owner')));
  assert.equal(engine.getState('a').satiety, 70); assert.equal(engine.getState('a').revision, 31); assert.equal(seen.length, 30);
  assert(Object.isFrozen(engine.getState('a'))); assert.throws(() => { engine.getState('a').satiety = 100; });
  const before = engine.getState('a'); await engine.adjustStat('a', 'rest', 100, 'system'); assert.deepEqual(engine.getState('a'), before);
  await engine.stop();
});
test('save tracks last stored revision across several unsaved changes and rejects conflicts', async () => {
  const { engine, persistence } = setup(); await engine.loadCharacter('a');
  await engine.adjustStat('a', 'satiety', -10, 'job'); await engine.adjustStat('a', 'satiety', -10, 'job'); await engine.flush();
  assert.equal((await persistence.load('a')).revision, 3); await engine.flush();
  await assert.rejects(persistence.save({ ...(await persistence.load('a')), revision: 4 }, 1), /conflict/);
  await engine.stop();
});
test('storage load failure is propagated and never initializes or overwrites with defaults', async () => {
  let writes = 0;
  const { engine } = setup({ persistence: { load: async () => { throw Error('bad disk'); }, save: async () => writes++, flush: async () => {}, close: async () => {} } });
  await assert.rejects(engine.loadCharacter('a'), /bad disk/); assert.equal(writes, 0); assert.equal(engine.getState('a'), null); await engine.stop();
});
test('disconnect/stop I/O failures retain dirty data and can be retried', async () => {
  const p = new MemoryAdapter(); let fail = false;
  const { engine } = setup({ persistence: { load: p.load.bind(p), save: (...args) => fail ? Promise.reject(Error('disk')) : p.save(...args), flush: p.flush.bind(p), close: p.close.bind(p) } });
  await engine.loadCharacter('a'); await engine.adjustStat('a', 'rest', -20, 'job'); fail = true;
  await assert.rejects(engine.unloadCharacter('a'), /disk/); assert.equal(engine.getStatus().activeCharacters, 0); assert.equal(engine.getStatus().pendingSaves, 1);
  await assert.rejects(engine.stop(), /save\/flush/); fail = false; await engine.stop(); assert.equal((await p.load('a')).rest, 80);
});
test('warnings occur on real crossings, use hysteresis and obey per-stat cooldown', async () => {
  const events = [], { engine, clock } = setup({ onThreshold: e => events.push(e), config: { decayPerHour: { satiety: 0, hydration: 0, rest: 0 } } });
  await engine.loadCharacter('a'); await engine.adjustStat('a', 'satiety', -50, 'admin');
  for (const delta of [1, -1, 1, -1]) await engine.adjustStat('a', 'satiety', delta, 'admin'); assert.equal(events.length, 1);
  await engine.adjustStat('a', 'satiety', -30, 'admin'); assert.equal(events.length, 1);
  clock.advance(60001); await engine.adjustStat('a', 'satiety', -15, 'admin'); assert.equal(events.length, 2); assert.equal(events[1].severity, 'severe');
  await engine.stop();
});
test('inactive identities, invalid mutations, rate excess and subscriptions are bounded', async () => {
  const { engine } = setup({ config: { limits: { adjustmentsPerMinute: 1, maxSubscriptions: 1 } } }); await engine.loadCharacter('a');
  for (const args of [['a', 'foo', 1, 'food'], ['a', 'rest', Infinity, 'food'], ['a', 'rest', '1', 'food'], ['a', 'rest', 1, 'fake']]) await assert.rejects(engine.adjustStat(...args));
  await assert.rejects(engine.adjustStat('b', 'rest', -1, 'job'), /active/);
  await engine.adjustStat('a', 'rest', -1, 'job'); await assert.rejects(engine.adjustStat('a', 'rest', -1, 'job'), /rate/);
  const unsub = engine.onStateChange('a', () => {}); assert.throws(() => engine.onStateChange('b', () => {}), /limit/); unsub(); engine.onStateChange('b', () => {});
  await engine.stop(); await engine.stop(); await assert.rejects(engine.adjustStat('a', 'rest', 1, 'system'), /stopped/);
});
test('disabled core never loads characters, changes stats or runs a ticker', async () => {
  const { engine } = setup({ config: { enabled: false } }); await assert.rejects(engine.loadCharacter('a'), /disabled/); await engine.tick(); assert.equal(engine.getStatus().ready, false); await engine.stop();
});
test('exhausted revisions reject changes without partially mutating the stored values', async () => {
  const p = new MemoryAdapter(); await p.save({ schemaVersion: 1, characterId: 'a', satiety: 100, hydration: 100, rest: 100, revision: Number.MAX_SAFE_INTEGER, lastPersistedAt: 0 }, 0);
  const { engine } = setup({ persistence: p }); await engine.loadCharacter('a');
  await assert.rejects(engine.adjustStat('a', 'rest', -1, 'system'), /exhausted/); assert.equal(engine.getState('a').rest, 100); await engine.stop();
});
