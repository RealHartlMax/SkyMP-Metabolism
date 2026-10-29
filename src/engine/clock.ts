import { performance } from 'node:perf_hooks';
import type { Clock } from '../domain/types';
import { finite } from '../domain/stats';
export function createRealClock(): Clock { return { now: () => performance.now(), wallNow: Date.now }; }
export function createFakeClock(startMs = 0, epoch = 1793145600000) {
  finite(startMs); let current = startMs;
  return { now: () => current, wallNow: () => epoch + Math.floor(current),
    advance(ms: number) { finite(ms); if (ms < 0) throw new RangeError('Negative elapsed time'); current += ms; },
    set(ms: number) { finite(ms); current = ms; },
  };
}
export function cappedElapsedMs(elapsedMs: number, capMs: number) {
  finite(elapsedMs); finite(capMs); if (capMs < 0) throw new RangeError('Negative cap');
  return Math.max(0, Math.min(elapsedMs, capMs));
}
