import type { ConsumableDefinition, MetabolismReason, MetabolismSnapshot, MetabolismStat } from '../domain/types';
export type { ConsumableDefinition, MetabolismReason, MetabolismSnapshot, MetabolismStat, MetabolismStateV1 } from '../domain/types';
export interface SkyMpMetabolismApiV1 {
  readonly apiVersion: 1;
  getState(characterId: string): Readonly<MetabolismSnapshot> | null;
  /** Trusted server plugins only. Owner is audit attribution, not a sandbox credential. */
  adjustStat(characterId: string, stat: MetabolismStat, delta: number, reason: MetabolismReason, owner?: string): Promise<Readonly<MetabolismSnapshot>>;
  registerConsumable(def: ConsumableDefinition): void;
  unregisterConsumable(owner: string, key: string): void;
  onStateChange(owner: string, handler: (state: Readonly<MetabolismSnapshot>, changedStats: MetabolismStat[]) => void | Promise<void>): () => void;
  getStatus(): { ready: boolean; apiVersion: 1; activeCharacters: number; persistenceMode: 'native' | 'session-only'; pendingSaves: number };
}
