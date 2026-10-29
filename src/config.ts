import { type MetabolismConfig, STATS, OWNER } from './domain/types';
import { bounded, check, keys, object } from './domain/validation';
export const defaults: MetabolismConfig = {
  enabled: true, schemaVersion: 1, locale: 'de',
  clock: { mode: 'real-online', tickIntervalSeconds: 30, maxCatchUpSeconds: 120, offlineDecay: false, lifecyclePollSeconds: 1 },
  initialState: { satiety: 100, hydration: 100, rest: 100 }, decayPerHour: { satiety: 5, hydration: 8, rest: 4 },
  thresholds: { warning: 50, critical: 25, severe: 10, hysteresis: 3, notificationCooldownSeconds: 60 },
  debuffs: { enabled: false }, damage: { enabled: false }, death: { enabled: false },
  ui: { enabled: true, widgetId: OWNER + ':status', updateIntervalSeconds: 5 },
  chat: { enabled: true, statusCommand: 'status' }, persistence: { mode: 'native', autosaveSeconds: 120 },
  limits: { maxActiveCharacters: 512, maxConsumables: 256, maxSubscriptions: 128, adjustmentsPerMinute: 120 },
};
export function readConfig(value: unknown = {}): MetabolismConfig {
  object(value); keys(value, Object.keys(defaults));
  const c = structuredClone(defaults);
  for (const key of Object.keys(c) as (keyof MetabolismConfig)[]) {
    if (!Object.hasOwn(value, key)) continue;
    if (typeof c[key] === 'object') {
      const part = value[key]; object(part); keys(part, Object.keys(c[key] as object)); Object.assign(c[key] as object, part);
    } else (c as unknown as Record<string, unknown>)[key] = value[key];
  }
  check(typeof c.enabled === 'boolean' && c.schemaVersion === 1, 'Invalid enabled/schemaVersion');
  check(c.locale === 'de' || c.locale === 'en', 'Invalid locale');
  check(c.clock.mode === 'real-online' && c.clock.offlineDecay === false, 'Only real-online without offline decay is supported');
  bounded(c.clock.tickIntervalSeconds, 1, 3600, 'tickIntervalSeconds');
  bounded(c.clock.lifecyclePollSeconds, 0.1, 5, 'lifecyclePollSeconds');
  bounded(c.clock.maxCatchUpSeconds, c.clock.tickIntervalSeconds, 3600, 'maxCatchUpSeconds');
  check(c.clock.lifecyclePollSeconds <= c.clock.tickIntervalSeconds, 'Lifecycle polling must not exceed tick interval');
  for (const k of STATS) { bounded(c.initialState[k], 0, 100, 'initialState.' + k); bounded(c.decayPerHour[k], 0, 100, 'decayPerHour.' + k); }
  const t = c.thresholds;
  bounded(t.severe, 0, 100, 'severe'); bounded(t.critical, 0, 100, 'critical'); bounded(t.warning, 0, 100, 'warning');
  bounded(t.hysteresis, 0, 20, 'hysteresis'); bounded(t.notificationCooldownSeconds, 0, 3600, 'notificationCooldownSeconds');
  check(t.severe < t.critical && t.critical < t.warning && t.warning + t.hysteresis <= 100, 'Invalid threshold ordering');
  for (const key of ['debuffs', 'damage', 'death'] as const) check(c[key].enabled === false, key + ' requires a verified source-owned effect adapter');
  check(typeof c.ui.enabled === 'boolean' && typeof c.chat.enabled === 'boolean', 'Invalid integration flags');
  check(typeof c.ui.widgetId === 'string' && new RegExp('^' + OWNER + ':[a-z][a-z0-9._-]{0,46}$').test(c.ui.widgetId), 'UI widget must use owner namespace');
  bounded(c.ui.updateIntervalSeconds, 1, 30, 'updateIntervalSeconds');
  check(typeof c.chat.statusCommand === 'string' && /^[a-z0-9][a-z0-9_-]{0,31}$/.test(c.chat.statusCommand), 'Invalid status command');
  check(['native', 'session-only'].includes(c.persistence.mode), 'Invalid persistence mode');
  bounded(c.persistence.autosaveSeconds, 1, 3600, 'autosaveSeconds');
  for (const [k, v] of Object.entries(c.limits)) { bounded(v, 1, k === 'maxActiveCharacters' ? 4096 : 1024, k); check(Number.isInteger(v), 'Integer limit required'); }
  return c;
}
