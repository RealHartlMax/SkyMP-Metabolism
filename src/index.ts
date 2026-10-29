import fs from 'node:fs';
import path from 'node:path';
import { createMetabolism } from './runtime';
import { readLocaleFiles } from './localization';
import { check } from './domain/validation';
import type { SkyMpMetabolismApiV1 } from './api/contract';
declare global { var skympMetabolism: SkyMpMetabolismApiV1 | undefined; }
const globals = globalThis as any, key = Symbol.for('skymp-metabolism.runtime.v1');
if (globals[key]) {
  check(globals[key].mp === globals.mp, '[skymp-metabolism] Native instance changed; full game server restart required');
} else {
  check(!Object.hasOwn(globals, 'skympMetabolism'), '[skymp-metabolism] API namespace already occupied');
  const configPath = process.env.SKYMP_METABOLISM_CONFIG ? path.resolve(process.cwd(), process.env.SKYMP_METABOLISM_CONFIG) :
    path.join(process.cwd(), 'Plugins/SkyMPMetabolism/config.json');
  let config: unknown = {};
  if (fs.existsSync(configPath)) {
    check(fs.statSync(configPath).size <= 16384, '[skymp-metabolism] Config exceeds 16 KiB');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  const runtime = createMetabolism(globals.mp, { config, locales: readLocaleFiles(path.join(path.dirname(configPath), 'locales')),
    chatApi: globals.skympChat, getUiApi: () => globals.skympUi });
  Object.defineProperty(globals, 'skympMetabolism', { value: runtime.api, writable: false, configurable: false });
  Object.defineProperty(globals, key, { value: { ...runtime, mp: globals.mp }, writable: false, configurable: false });
  process.once('exit', () => runtime.submitExit());
  console.info('[skymp-metabolism] API v1 initialized; persistence=' + runtime.config.persistence.mode + '; native DB commit acknowledgement unavailable');
}
