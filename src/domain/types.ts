export const SCHEMA_VERSION = 1 as const;
export const API_VERSION = 1 as const;
export const OWNER = 'skymp-metabolism';
export const STATS = ['satiety', 'hydration', 'rest'] as const;
export type MetabolismStat = typeof STATS[number];
export type MetabolismReason = 'food' | 'drink' | 'sleep' | 'disease' | 'job' | 'admin' | 'system';
export type Locale = 'de' | 'en';
export type Values = Record<MetabolismStat, number>;
export type Severity = 'healthy' | 'warning' | 'critical' | 'severe';
export interface MetabolismSnapshot extends Values { schemaVersion: 1; characterId: string; revision: number }
export interface MetabolismStateV1 extends MetabolismSnapshot { lastPersistedAt: number }
export interface ConsumableDefinition {
  key: string; itemId: string; effects: Partial<Values>; cooldownSeconds?: number; owner: string;
}
export interface MetabolismConfig {
  enabled: boolean; schemaVersion: 1; locale: Locale;
  clock: { mode: 'real-online'; tickIntervalSeconds: number; maxCatchUpSeconds: number; offlineDecay: false; lifecyclePollSeconds: number };
  initialState: Values; decayPerHour: Values;
  thresholds: { warning: number; critical: number; severe: number; hysteresis: number; notificationCooldownSeconds: number };
  debuffs: { enabled: false }; damage: { enabled: false }; death: { enabled: false };
  ui: { enabled: boolean; widgetId: string; updateIntervalSeconds: number };
  chat: { enabled: boolean; statusCommand: string };
  persistence: { mode: 'native' | 'session-only'; autosaveSeconds: number };
  limits: { maxActiveCharacters: number; maxConsumables: number; maxSubscriptions: number; adjustmentsPerMinute: number };
}
export interface Clock {
  /** Monotonic milliseconds, never serialized as an epoch. */
  now(): number;
  wallNow(): number;
}
export type Logger = Pick<Console, 'info' | 'warn' | 'error'>;
