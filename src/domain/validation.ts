import { STATS, type MetabolismStateV1, type MetabolismReason } from './types';
import { finite } from './stats';
export function check(condition: unknown, message: string): asserts condition { if (!condition) throw new TypeError(message); }
export function object(value: unknown): asserts value is Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'Expected plain object');
  for (const key of Object.keys(value)) check(!Object.getOwnPropertyDescriptor(value, key)?.get, 'Getters are not allowed');
}
export function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  for (const k of Object.keys(value)) check(allowed.includes(k), 'Unknown key: ' + k);
}
export function bounded(value: unknown, min: number, max: number, name: string): asserts value is number {
  finite(value, name); check(value >= min && value <= max, 'Out of range: ' + name);
}
export function characterId(value: unknown): asserts value is string {
  check(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_:-]{0,127}$/.test(value), 'Invalid characterId');
}
export function ownerId(value: unknown): asserts value is string {
  check(typeof value === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(value), 'Invalid owner');
}
export function validateReason(value: unknown): asserts value is MetabolismReason {
  check(['food', 'drink', 'sleep', 'disease', 'job', 'admin', 'system'].includes(value as string), 'Invalid reason');
}
/** V1 is the first shipped schema. Unknown/legacy schemas are rejected, never reset. */
export function deserializeState(value: unknown, expectedId?: string): MetabolismStateV1 {
  object(value); keys(value, ['schemaVersion', 'characterId', ...STATS, 'revision', 'lastPersistedAt']);
  check(value.schemaVersion === 1, 'Unsupported state schemaVersion; migration required');
  characterId(value.characterId); check(expectedId === undefined || value.characterId === expectedId, 'Character mismatch');
  for (const k of STATS) bounded(value[k], 0, 100, k);
  check(Number.isSafeInteger(value.revision) && (value.revision as number) >= 1, 'Invalid revision');
  check(Number.isSafeInteger(value.lastPersistedAt) && (value.lastPersistedAt as number) >= 0, 'Invalid persisted epoch');
  return { ...value } as unknown as MetabolismStateV1;
}
