'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { clampStat, applyDecay, applyAdjustment, readConfig, evaluateThreshold, createLocalizer, deserializeState } = require('../dist/library.cjs');
test('canonical stats clamp valid numbers and reject coercion, NaN and infinity', () => {
  assert.equal(clampStat(-1), 0); assert.equal(clampStat(101), 100); assert.equal(applyAdjustment(99, 3), 100);
  assert.equal(applyDecay(100, 5, 3600), 95);
  for (const bad of [NaN, Infinity, -Infinity, '1', null, undefined, {}, true]) assert.throws(() => clampStat(bad));
  for (const bad of [-1, NaN, Infinity, '5']) assert.throws(() => applyDecay(100, bad, 30));
  assert.throws(() => applyDecay(100, 5, -1));
});
test('configuration rejects unsupported effects/offline time, unknown keys and unsafe bounds', () => {
  const cases = [null, [], { unexpected: true }, { enabled: 'true' }, { locale: 'fr' }, { schemaVersion: 2 },
    { clock: { tickIntervalSeconds: 0 } }, { clock: { tickIntervalSeconds: '30' } }, { clock: { offlineDecay: true } },
    { clock: { maxCatchUpSeconds: Infinity } }, { clock: { bad: 1 } }, { decayPerHour: { hydration: -1 } },
    { initialState: { rest: 101 } }, { thresholds: { warning: 10 } }, { thresholds: { severe: NaN } },
    { debuffs: { enabled: true } }, { damage: { enabled: true } }, { death: { enabled: true } },
    { ui: { widgetId: 'metabolism:status' } }, { chat: { statusCommand: '/status' } }, { persistence: { mode: 'file' } },
    { limits: { maxActiveCharacters: 1.5 } }, JSON.parse('{"__proto__":{"enabled":false}}')];
  for (const c of cases) assert.throws(() => readConfig(c), JSON.stringify(c));
  assert.deepEqual(readConfig(JSON.parse(fs.readFileSync('config/config.example.json'))), readConfig());
});
test('thresholds worsen immediately, recover with hysteresis and retain their latched level', () => {
  const t = readConfig().thresholds;
  assert.equal(evaluateThreshold(50, t, 'healthy'), 'warning');
  assert.equal(evaluateThreshold(51, t, 'warning'), 'warning');
  assert.equal(evaluateThreshold(52.9, t, 'warning'), 'warning');
  assert.equal(evaluateThreshold(53, t, 'warning'), 'healthy');
  assert.equal(evaluateThreshold(5, t, 'healthy'), 'severe');
  assert.equal(evaluateThreshold(26, t, 'severe'), 'critical');
  assert.equal(evaluateThreshold(51, t, 'severe'), 'warning');
});
test('German and English catalogs match, allow partial overrides and fall back per key', () => {
  const de = JSON.parse(fs.readFileSync('locales/de.json')), en = JSON.parse(fs.readFileSync('locales/en.json'));
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  const l = createLocalizer('de', { en: { satiety: 'Food' } });
  assert.equal(l.t('satiety', 'en-US'), 'Food'); assert.equal(l.t('hydration', 'en'), 'Hydration');
  assert.equal(l.t('rest', 'fr'), 'Erholung'); assert.equal(l.number(99.5, 'de'), '99,5');
  assert.throws(() => createLocalizer('de', { en: { foo: 'x' } }));
  assert.throws(() => createLocalizer('de', { en: { rest: '\n' } }));
});
test('saved states require schema, identity, range, revision and real epoch metadata', () => {
  const state = { schemaVersion: 1, characterId: 'a', satiety: 100, hydration: 50, rest: 20, revision: 3, lastPersistedAt: 1000 };
  assert.deepEqual(deserializeState(state, 'a'), state);
  for (const patch of [{ schemaVersion: 0 }, { revision: 0 }, { revision: 1.5 }, { rest: 101 }, { satiety: -1 }, { hydration: '3' }, { lastPersistedAt: -1 }, { lastPersistedAt: NaN }])
    assert.throws(() => deserializeState({ ...state, ...patch }));
  assert.throws(() => deserializeState(state, 'b'));
});
