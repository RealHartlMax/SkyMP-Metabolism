import { STATS, type MetabolismConfig, type MetabolismSnapshot, type MetabolismStateV1, type Severity, type Clock } from '../domain/types';
import { deserializeState } from '../domain/validation';
import { severityFromValue } from './thresholds';
export interface CharacterSession {
  state: MetabolismStateV1; persistedRevision: number; online: boolean; dirty: boolean;
  lastTick: number; lastSaved: number; severity: Record<typeof STATS[number], Severity>;
  nextNotice: Record<typeof STATS[number], number>; adjustments: number; budgetAt: number;
}
export function createSession(id: string, c: MetabolismConfig, clock: Clock, saved: MetabolismStateV1 | null): CharacterSession {
  const state: MetabolismStateV1 = saved ? deserializeState(saved, id) : {
    ...c.initialState, schemaVersion: 1, characterId: id, revision: 1, lastPersistedAt: 0,
  };
  return { state, persistedRevision: saved?.revision ?? 0, online: true, dirty: !saved,
    lastTick: clock.now(), lastSaved: clock.now(), budgetAt: clock.now(), adjustments: 0,
    severity: Object.fromEntries(STATS.map(s => [s, severityFromValue(state[s], c.thresholds)])) as CharacterSession['severity'],
    nextNotice: { satiety: -Infinity, hydration: -Infinity, rest: -Infinity },
  };
}
export function snapshot(s: CharacterSession): Readonly<MetabolismSnapshot> {
  const { lastPersistedAt: _, ...value } = s.state; return Object.freeze(value);
}
