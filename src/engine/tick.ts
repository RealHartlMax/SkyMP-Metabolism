import { STATS, type MetabolismConfig, type MetabolismStat } from '../domain/types';
import { applyDecay, changedStats } from '../domain/stats';
import type { CharacterSession } from './session';
import { cappedElapsedMs } from './clock';
import { check } from '../domain/validation';
export function decaySession(s: CharacterSession, c: MetabolismConfig, now: number): MetabolismStat[] {
  if (now < s.lastTick) return [];
  const elapsed = cappedElapsedMs(now - s.lastTick, c.clock.maxCatchUpSeconds * 1000) / 1000;
  s.lastTick = now;
  if (!s.online || !c.enabled || elapsed === 0) return [];
  const next = { ...s.state };
  for (const key of STATS) next[key] = applyDecay(s.state[key], c.decayPerHour[key], elapsed);
  const changed = changedStats(s.state, next);
  if (changed.length) { check(s.state.revision < Number.MAX_SAFE_INTEGER, 'Revision exhausted'); s.state = next; }
  return changed;
}
