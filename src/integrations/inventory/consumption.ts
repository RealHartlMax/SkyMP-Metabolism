import type { ConsumableDefinition } from '../../domain/types';
import { bounded, check, keys, object, ownerId } from '../../domain/validation';
import { isStat } from '../../domain/stats';
export function validateConsumable(input: unknown): ConsumableDefinition {
  object(input); keys(input, ['key', 'itemId', 'effects', 'cooldownSeconds', 'owner']); ownerId(input.owner);
  check(typeof input.key === 'string' && input.key.startsWith(input.owner + ':') &&
    /^[a-z][a-z0-9-]{0,47}:[a-z][a-z0-9._-]{0,63}$/.test(input.key), 'Invalid consumable namespace');
  check(typeof input.itemId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(input.itemId), 'Invalid itemId');
  object(input.effects); check(Object.keys(input.effects).length > 0, 'Empty consumable effects');
  for (const [stat, delta] of Object.entries(input.effects)) { check(isStat(stat), 'Invalid effect stat'); bounded(delta, -100, 100, 'effect'); }
  if (input.cooldownSeconds !== undefined) bounded(input.cooldownSeconds, 0, 86400, 'cooldownSeconds');
  return Object.freeze({ key: input.key, itemId: input.itemId, effects: Object.freeze({ ...input.effects }),
    owner: input.owner, ...(input.cooldownSeconds === undefined ? {} : { cooldownSeconds: input.cooldownSeconds }) }) as ConsumableDefinition;
}
export class ConsumableRegistry {
  private readonly entries = new Map<string, ConsumableDefinition>();
  constructor(private readonly limit = 256) {}
  register(input: ConsumableDefinition) {
    const def = validateConsumable(input); check(!this.entries.has(def.key), 'Duplicate consumable');
    check(this.entries.size < this.limit, 'Consumable limit'); this.entries.set(def.key, def);
  }
  unregister(owner: string, key: string) {
    ownerId(owner); const def = this.entries.get(key); if (!def) return;
    check(def.owner === owner, 'Consumable owner mismatch'); this.entries.delete(key);
  }
  list(): readonly ConsumableDefinition[] { return Object.freeze([...this.entries.values()]); }
  clear() { this.entries.clear(); }
}
/** Deliberately closed until the native post-consumption commit hook exists. */
export class ItemUseAdapter {
  readonly itemUseHookAvailable = false;
  async consume(_request: unknown) { return Object.freeze({ accepted: false as const, code: 'no-hook' as const }); }
}
