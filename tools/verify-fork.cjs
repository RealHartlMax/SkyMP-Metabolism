'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { loadForkLoader, digest } = require('./fork-loader.cjs');
const { FakeMp } = require('../tests/helpers.cjs');
const { NATIVE_PROPERTY } = require('../dist/library.cjs');
const root = path.resolve(__dirname, '..'), fork = path.resolve(process.env.SKYMP_FORK || path.join(root, '../skymp'));
function nativeServer() {
  const { ScampServer } = require(path.join(fork, 'build/dist/server/scam_native.node'));
  const mp = new ScampServer(JSON.stringify({ port: 0, listenHost: '127.0.0.1', maxPlayers: 4,
    dataDir: path.join(fork, 'build/dist/server/data'), loadOrder: ['Skyrim.esm'], npcEnabled: false, itemsEnabled: false,
    databaseDriver: 'file', databaseName: 'world', logLevel: 'error' }));
  mp._setSelf(mp); mp.attachSaveStorage(); return mp;
}
async function waitForStorage(mp, expected) {
  const dir = path.join(process.cwd(), 'world/changeForms'), deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    mp.tick(); await new Promise(resolve => setTimeout(resolve, 20));
    if (!fs.existsSync(dir)) continue;
    const records = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      try { records.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { /* a write may still be pending */ }
    }
    if (expected.every(e => records.some(r => r.profileId === e.profileId && isDeepStrictEqual(r.dynamicFields?.[NATIVE_PROPERTY], e.envelope)))) return;
  }
  throw Error('Native SaveStorage did not persist the expected envelope within 10 seconds');
}
async function main() {
  if (process.argv[2] === '--reopen') {
    process.chdir(process.argv[3]); const expected = JSON.parse(fs.readFileSync('expected.json', 'utf8')), mp = nativeServer();
    for (const e of expected) {
      const actor = mp.getActorsByProfileId(e.profileId)[0]; assert(actor, 'Saved actor missing after new native process');
      assert.deepEqual(mp.get(actor, NATIVE_PROPERTY), e.envelope);
    }
    console.log('Native restart: profile actors, private UUIDs, state and revisions reloaded from SaveStorage.'); return;
  }
  const native = process.argv.includes('--native'); fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'artifacts', native ? 'native-' : 'loader-'));
  const plugin = path.join(dir, 'Plugins/SkyMPMetabolism'); fs.mkdirSync(plugin, { recursive: true });
  // Only standalone runtime inputs; no src, dist library, relative helpers or node_modules.
  for (const file of ['plugin.json', 'index.cjs', 'config.example.json']) fs.copyFileSync(path.join(root, 'release/SkyMPMetabolism', file), path.join(plugin, file));
  fs.cpSync(path.join(root, 'locales'), path.join(plugin, 'locales'), { recursive: true });
  fs.writeFileSync(path.join(plugin, 'config.json'), JSON.stringify({ chat: { enabled: false }, ui: { enabled: false } }));
  process.chdir(dir); const statuses = [], loader = loadForkLoader(fork, statuses);
  const mp = native ? nativeServer() : new FakeMp(); globalThis.mp = mp;
  const options = { mode: 'safe', loadOrder: ['skymp-metabolism'], abortOnPluginError: true, processCommandAllowlist: [] };
  assert.equal(loader.discoverPlugins().length, 1); await loader.bootstrapPlugins(mp, options); assert.equal(globalThis.skympMetabolism, undefined);
  const state = loader.readDiscoveryState(); for (const p of Object.values(state.plugins)) { assert.equal(p.startupEnabled, false); p.startupEnabled = true; }
  loader.writeDiscoveryState(state); await loader.bootstrapPlugins(mp, options);
  const api = globalThis.skympMetabolism, runtime = globalThis[Symbol.for('skymp-metabolism.runtime.v1')];
  assert(api?.getStatus().ready, 'Real loader must produce a functioning API, not just report plugin loaded');
  assert(Object.isFrozen(api)); assert.equal(Object.getOwnPropertyDescriptor(globalThis, 'skympMetabolism').writable, false);
  // A second temporary require must reuse the instance and never add another scheduler/listener set.
  await loader.bootstrapPlugins(mp, options); assert.equal(globalThis.skympMetabolism, api);
  const users = [], actors = [], bots = [];
  if (native) {
    mp.on('connect', userId => users.push(userId));
    bots.push(mp.createBot(), mp.createBot()); mp.tick(); assert.equal(users.length, 2);
    for (let i = 0; i < 2; i++) { const actor = mp.createActor(0, [i, 0, 0], 0, 0x3c, 10001 + i); actors.push(actor); mp.setUserActor(users[i], actor); }
  } else {
    users.push(0, 1); for (let i = 0; i < 2; i++) { const actor = mp.addActor(101 + i, 10001 + i); actors.push(actor); mp.connect(users[i], actor); }
  }
  // Complete the initial boot scan, then reconcile users connected during that scan.
  await runtime.pump(); await runtime.pump(); assert.equal(api.getStatus().activeCharacters, 2);
  const ids = actors.map(actor => mp.get(actor, NATIVE_PROPERTY).characterId); assert.notEqual(ids[0], ids[1]);
  const beforeB = api.getState(ids[1]); await api.adjustStat(ids[0], 'satiety', -25, 'job', 'compat-consumer');
  assert(api.getState(ids[0]).satiety <= 75); assert.equal(api.getState(ids[1]).satiety, beforeB.satiety);
  await runtime.flush(); assert.equal(mp.get(actors[0], NATIVE_PROPERTY).state.revision, api.getState(ids[0]).revision);
  await runtime.stop();
  let restartVerified = false;
  if (native) {
    const expected = actors.map((actor, i) => ({ profileId: 10001 + i, envelope: mp.get(actor, NATIVE_PROPERTY) }));
    await waitForStorage(mp, expected); fs.writeFileSync(path.join(dir, 'expected.json'), JSON.stringify(expected));
    const child = spawnSync(process.execPath, [__filename, '--reopen', dir], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(child.status, 0, child.stdout + child.stderr); restartVerified = true; bots.forEach(bot => bot.destroy());
  }
  const report = { passed: true, nativeRuntime: native, durableNativeRestartVerified: restartVerified, skyrimStarted: false,
    actualClientCount: 0, fork, forkLoaderSHA256: loader.sourceHash, pluginSHA256: digest(fs.readFileSync(path.join(plugin, 'index.cjs'))),
    checks: ['real manifest validator/discovery', 'safe-mode disabled default and persistent activation', 'real requireTemp standalone bundle',
      'global API collision/repeated bootstrap protection', 'two isolated character UUIDs and trusted API changes',
      ...(native ? ['native bot/session/actor/profile routing', 'real private dynamicFields persistence', 'new native process reload from file SaveStorage'] : [])] };
  fs.writeFileSync(path.join(root, 'artifacts', native ? 'native-validation.json' : 'loader-validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
