import type { MetabolismConfig, Severity } from '../domain/types';
import { clampStat } from '../domain/stats';
export const LEVELS: readonly Severity[] = ['healthy', 'warning', 'critical', 'severe'];
type Thresholds = MetabolismConfig['thresholds'];
export function severityFromValue(value: number, t: Thresholds): Severity {
  const v = clampStat(value); return v <= t.severe ? 'severe' : v <= t.critical ? 'critical' : v <= t.warning ? 'warning' : 'healthy';
}
export function evaluateThreshold(value: number, t: Thresholds, previous: Severity): Severity {
  const v = clampStat(value), raw = LEVELS.indexOf(severityFromValue(v, t)); let level = LEVELS.indexOf(previous);
  if (raw >= level) return LEVELS[raw];
  const boundaries = [Infinity, t.warning, t.critical, t.severe];
  while (level > raw && v >= boundaries[level] + t.hysteresis) level--;
  return LEVELS[level];
}
