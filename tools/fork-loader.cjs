'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), ts = require('typescript');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const transpile = src => ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
// Execute selected functions from the CURRENT local fork, rather than a reimplementation of its loader.
function loadForkLoader(fork, statuses) {
  const source = fs.readFileSync(path.join(fork, 'skymp5-server/ts/index.ts'), 'utf8');
  const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const wanted = new Set(['pluginsLog', 'pluginsWarn', 'pluginsError', 'SAFE_PLUGIN_NAME_RE', 'SAFE_VERSION_RE',
    'toAbsolutePath', 'getAlternativeNtfsAliasPath', 'resolveExistingPath', 'sha256', 'ensureMainPath', 'isRelativePathSafe',
    'readPluginManifest', 'fingerprintPlugin', 'discoverPlugins', 'buildPluginSortOrder', 'requireTemp', 'runGamemodePlugin', 'bootstrapPlugins']);
  const selected = [];
  for (const node of ast.statements) {
    const names = ts.isFunctionDeclaration(node) && node.name ? [node.name.text] : ts.isVariableStatement(node) ? node.declarationList.declarations.map(d => d.name.getText(ast)) : [];
    if (names.some(n => wanted.has(n))) { selected.push(node.getFullText(ast)); names.forEach(n => wanted.delete(n)); }
  }
  assert.equal(wanted.size, 0, 'Fork loader changed: ' + [...wanted]);
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', transpile(fs.readFileSync(path.join(fork, 'skymp5-server/ts/pluginDiscoveryState.ts'), 'utf8')))(require, mod, mod.exports);
  const state = mod.exports;
  const publication = require('./load-fork-runtime.cjs')(fork, ts);
  const actual = new Function('fs', 'os', 'path', 'crypto', 'ui', 'readDiscoveryState', 'writeDiscoveryState', 'PLUGINS_DIR',
    'installShutdownHooks', 'askToEnablePlugin', 'runProcessPlugin', 'publishPluginRuntimeSelection', 'publishStartedPluginRuntime', 'validatePluginRuntime', 'require', transpile(selected.join('\n')) + '\nreturn {discoverPlugins,bootstrapPlugins: (server, options) => bootstrapPlugins(server, {dataDir: path.join(process.cwd(), "data"), ...options})};')(
      fs, os, path, crypto, { updatePluginRuntimeStatus: (name, status) => statuses.push({ name, status }) },
      state.readDiscoveryState, state.writeDiscoveryState, state.PLUGINS_DIR, () => {}, () => { throw Error('Unexpected prompt'); },
      () => { throw Error('Unexpected process plugin'); }, publication.publishPluginRuntimeSelection, publication.publishStartedPluginRuntime, publication.validatePluginRuntime, require);
  return { ...state, ...actual, sourceHash: digest(source) };
}
module.exports = { loadForkLoader, digest };
