// Test-only source loader. Execute the real fork publication code in memory; no emitted bundle.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
module.exports=function(fork,ts){
  const filename=path.join(fork,'skymp5-server/ts/pluginRuntimePackages.ts'),module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  Function('require','module','exports',code)(createRequire(filename),module,module.exports);
  return module.exports;
};
