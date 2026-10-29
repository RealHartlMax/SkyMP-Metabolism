'use strict';
const fs = require('node:fs'), path = require('node:path'), esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
async function main() {
  for (const [entry, output] of [['src/index.ts', 'dist/index.cjs'], ['src/library.ts', 'dist/library.cjs'], ['examples/consumer.ts', 'dist/example.cjs']])
    await esbuild.build({ absWorkingDir: root, entryPoints: [entry], outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node20', legalComments: 'none' });
  const ts = require('typescript');
  const program = ts.createProgram(['src/api/contract.ts'], { declaration: true, emitDeclarationOnly: true, strict: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10,
    rootDir: path.join(root, 'src'), outDir: path.join(root, 'dist/types'), types: ['node'], skipLibCheck: true });
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  program.emit();
  const release = path.join(root, 'release/SkyMPMetabolism'); fs.mkdirSync(release, { recursive: true });
  for (const [from, to] of [['dist/index.cjs', 'index.cjs'], ['plugin.json', 'plugin.json'], ['config/config.example.json', 'config.example.json'], ['README.md', 'README.md'], ['LICENSE', 'LICENSE']])
    fs.copyFileSync(path.join(root, from), path.join(release, to));
  for (const [from, to] of [['locales', 'locales'], ['docs', 'docs'], ['dist/types', 'types']]) fs.cpSync(path.join(root, from), path.join(release, to), { recursive: true });
  // Do not overwrite an operator's config.json, even on repeated local builds.
  const config = path.join(release, 'config.json'); if (!fs.existsSync(config)) fs.copyFileSync(path.join(root, 'config/config.example.json'), config);
  console.log('Standalone CommonJS build and unpacked plugin folder ready. No archives created.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
