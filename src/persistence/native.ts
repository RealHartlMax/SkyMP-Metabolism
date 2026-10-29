import { randomUUID } from 'node:crypto';
import type { MetabolismStateV1 } from '../domain/types';
import { check, object, keys, deserializeState } from '../domain/validation';
import type { SkyMpApi } from '../integrations/skymp/adapter';
import { checkRevision, type PersistenceAdapter } from './adapter';
export const NATIVE_PROPERTY = 'private.skympMetabolism';
interface Envelope { schemaVersion: 1; characterId: string; profileId: number; state: MetabolismStateV1 | null }
interface Binding { actorId: number; profileId: number }
function profile(value: unknown): asserts value is number {
  check(Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0x7fffffff, 'No authenticated native profileId');
}
function decode(value: unknown, profileId: number): Envelope {
  object(value); keys(value, ['schemaVersion', 'characterId', 'profileId', 'state']);
  check(value.schemaVersion === 1, 'Unsupported native envelope schema');
  check(typeof value.characterId === 'string' && /^character:[a-f0-9-]{36}$/.test(value.characterId), 'Invalid native character UUID');
  check(value.profileId === profileId, 'Native profile ownership changed; explicit character migration required');
  const state = value.state === null ? null : deserializeState(value.state, value.characterId);
  return { schemaVersion: 1, characterId: value.characterId, profileId, state };
}
/** Uses the existing world SaveStorage. A completed save means native acceptance, not fsync. */
export class NativePersistenceAdapter implements PersistenceAdapter {
  private readonly bindings = new Map<string, Binding>();
  constructor(private readonly mp: SkyMpApi) {}
  bind(actorId: number): string {
    const profileId = this.mp.get(actorId, 'profileId'); profile(profileId);
    const raw = this.mp.get(actorId, NATIVE_PROPERTY);
    let envelope: Envelope;
    if (raw === undefined || raw === null) {
      envelope = { schemaVersion: 1, characterId: 'character:' + randomUUID(), profileId, state: null };
      this.mp.set(actorId, NATIVE_PROPERTY, envelope);
    } else envelope = decode(raw, profileId);
    const previous = this.bindings.get(envelope.characterId);
    check(!previous || previous.actorId === actorId, 'Duplicate character UUID on different native records');
    this.bindings.set(envelope.characterId, { actorId, profileId }); return envelope.characterId;
  }
  unbind(id: string) { this.bindings.delete(id); }
  matches(id: string, actorId: number): boolean {
    const b = this.bindings.get(id); if (!b || b.actorId !== actorId) return false;
    try { return this.read(id).characterId === id; } catch { return false; }
  }
  private read(id: string): Envelope {
    const b = this.bindings.get(id); check(b, 'Character is not bound to a native record');
    check(this.mp.get(b.actorId, 'profileId') === b.profileId, 'Native profile ownership changed');
    const result = decode(this.mp.get(b.actorId, NATIVE_PROPERTY), b.profileId);
    check(result.characterId === id, 'Native character identity changed'); return result;
  }
  async load(id: string) { return this.read(id).state; }
  saveSync(input: MetabolismStateV1, expected?: number) {
    const state = deserializeState(input), envelope = this.read(state.characterId);
    checkRevision(envelope.state, expected, state);
    this.mp.set(this.bindings.get(state.characterId)!.actorId, NATIVE_PROPERTY, { ...envelope, state });
  }
  async save(input: MetabolismStateV1, expected?: number) { this.saveSync(input, expected); }
  async delete(id: string) {
    const envelope = this.read(id); this.mp.set(this.bindings.get(id)!.actorId, NATIVE_PROPERTY, { ...envelope, state: null });
  }
  async flush() { /* No durable DB flush hook in the current fork. */ }
  async close() { this.bindings.clear(); }
}
