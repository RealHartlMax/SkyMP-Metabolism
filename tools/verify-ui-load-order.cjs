'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), esbuild = require('esbuild');
const { loadForkLoader, digest } = require('./fork-loader.cjs');
const { FakeMp } = require('../tests/helpers.cjs');
const root = path.resolve(__dirname, '..'), fork = path.resolve(process.env.SKYMP_FORK || path.join(root, '../skymp'));
const uiRoot = path.resolve(process.env.SKYMP_UI_CORE || path.join(root, '../SkyMP-UI-Core'));
async function main() {
  const dir = fs.mkdtempSync(path.join(root, 'artifacts/ui-load-order-'));
  const metabolismDir = path.join(dir, 'Plugins/SkyMPMetabolism'), uiDir = path.join(dir, 'Plugins/SkyMPUICore');
  fs.mkdirSync(metabolismDir, { recursive: true }); fs.mkdirSync(uiDir, { recursive: true });
  for (const file of ['plugin.json', 'index.cjs']) fs.copyFileSync(path.join(root, 'release/SkyMPMetabolism', file), path.join(metabolismDir, file));
  fs.writeFileSync(path.join(metabolismDir, 'config.json'), JSON.stringify({ chat: { enabled: false } }));
  fs.writeFileSync(path.join(uiDir, 'config.json'), '{}');
  fs.copyFileSync(path.join(uiRoot, 'plugin.json'), path.join(uiDir, 'plugin.json'));
  fs.cpSync(path.join(uiRoot, 'locales'), path.join(uiDir, 'locales'), { recursive: true });
  fs.cpSync(path.join(uiRoot, 'Runtime'), path.join(uiDir, 'Runtime'), { recursive: true });
  esbuild.buildSync({ entryPoints: [path.join(uiRoot, 'src/index.ts')], outfile: path.join(uiDir, 'index.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  process.chdir(dir);
  process.env.SKYMP_METABOLISM_CONFIG = path.join(metabolismDir, 'config.json');
  process.env.SKYMP_UI_CONFIG = path.join(uiDir, 'config.json');
  const mp = new FakeMp(); mp.addActor(101, 10); mp.addActor(102, 20); mp.connect(0, 101); mp.connect(1, 102); globalThis.mp = mp;
  const statuses = [], loader = loadForkLoader(fork, statuses), options = { mode: 'safe', loadOrder: [], abortOnPluginError: true, processCommandAllowlist: [] };
  await loader.bootstrapPlugins(mp, options);
  const state = loader.readDiscoveryState(); for (const p of Object.values(state.plugins)) p.startupEnabled = true; loader.writeDiscoveryState(state);
  await loader.bootstrapPlugins(mp, options);
  const order = statuses.filter(s => s.status === 'running').map(s => s.name);
  const metabolism = globalThis[Symbol.for('skymp-metabolism.runtime.v1')], ui = globalThis[Symbol.for('skymp-ui-core.runtime.v1')];
  assert(metabolism && ui, 'Both actual bundled entries must have started');
  await metabolism.pump(); await new Promise(resolve => setTimeout(resolve, 1100)); await metabolism.pump();
  for (const userId of [0, 1]) mp.emit('customPacket', userId, JSON.stringify({ customPacketType: 'skympUi:ready', protocolVersion: 1, frontId: 'load_order_' + userId }));
  ui.flush();
  for (const userId of [0, 1]) {
    const frame = mp.output.filter(p => p.userId === userId && p.customPacketType === 'skympUi:snapshot').at(-1);
    assert(frame, 'UI snapshot missing'); const widget = frame.widgets.find(w => w.definition.id === 'skymp-metabolism:status');
    assert(widget, 'Widget must recover when UI Core loads after Metabolism'); assert.equal(widget.state.items.length, 3);
  }
  assert.equal(metabolism.api.getStatus().activeCharacters, 2);
  await metabolism.stop(); ui.stop();
  const report = { passed: true, pluginsLoadOrder: [], loadedOrder: order, nativeRuntime: false, skyrimStarted: false,
    pluginSHA256: digest(fs.readFileSync(path.join(metabolismDir, 'index.cjs'))), uiCoreSHA256: digest(fs.readFileSync(path.join(uiDir, 'index.cjs'))),
    forkLoaderSHA256: loader.sourceHash, checks: ['real alphabetical plugin loader', 'Metabolism boots before UI Core', 'late UI Core service discovered', 'current private snapshots for two player actors'] };
  assert.deepEqual(report.loadedOrder, ['skymp-metabolism', 'skymp-ui-core']);
  fs.writeFileSync(path.join(root, 'artifacts/ui-load-order-validation.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
