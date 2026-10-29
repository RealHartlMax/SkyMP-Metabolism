import { STATS, type Values, type MetabolismStat } from './types';
export function finite(value: unknown, name = 'value'): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(name + ' must be a finite number');
}
export function clampStat(value: unknown): number { finite(value); return Math.max(0, Math.min(100, value)); }
export function isStat(value: unknown): value is MetabolismStat { return STATS.includes(value as MetabolismStat); }
export function applyAdjustment(current: number, delta: number): number {
  finite(current); finite(delta); return clampStat(current + delta);
}
export function applyDecay(current: number, rate: number, elapsedSeconds: number): number {
  finite(current); finite(rate); finite(elapsedSeconds);
  if (rate < 0 || elapsedSeconds < 0) throw new RangeError('Negative rate/time');
  return clampStat(current - rate * elapsedSeconds / 3600);
}
export function changedStats(before: Values, after: Values): MetabolismStat[] { return STATS.filter(k => before[k] !== after[k]); }
