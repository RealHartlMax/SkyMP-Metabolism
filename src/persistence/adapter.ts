import type { MetabolismStateV1 } from '../domain/types';
import { deserializeState, characterId, check } from '../domain/validation';
export interface PersistenceAdapter {
  load(characterId: string): Promise<MetabolismStateV1 | null>;
  /** expectedRevision=0 means the record must not exist. */
  save(state: MetabolismStateV1, expectedRevision?: number): Promise<void>;
  saveSync?(state: MetabolismStateV1, expectedRevision?: number): void;
  delete(characterId: string): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}
export function checkRevision(existing: MetabolismStateV1 | null, expected: number | undefined, next: MetabolismStateV1) {
  check(expected === undefined || (existing?.revision ?? 0) === expected, 'Revision conflict');
  check(!existing || next.revision >= existing.revision, 'Revision rollback');
  if (existing && next.revision === existing.revision) {
    check(['satiety', 'hydration', 'rest'].every(k => existing[k as 'satiety'] === next[k as 'satiety']), 'Same revision with different values');
  }
}
export class MemoryAdapter implements PersistenceAdapter {
  private readonly store = new Map<string, MetabolismStateV1>();
  async load(id: string) { characterId(id); const s = this.store.get(id); return s ? deserializeState(s, id) : null; }
  async save(input: MetabolismStateV1, expected?: number) {
    const s = deserializeState(input), existing = this.store.get(s.characterId) ?? null;
    checkRevision(existing, expected, s); this.store.set(s.characterId, s);
  }
  async delete(id: string) { characterId(id); this.store.delete(id); }
  async flush() {}
  async close() {}
}
