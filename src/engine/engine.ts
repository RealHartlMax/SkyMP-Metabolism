import { type Clock, type Logger, type MetabolismConfig, type MetabolismReason, type MetabolismSnapshot, type MetabolismStat, type Severity } from '../domain/types';
import { check, characterId, ownerId, bounded, validateReason } from '../domain/validation';
import { applyAdjustment, isStat } from '../domain/stats';
import { readConfig } from '../config';
import type { PersistenceAdapter } from '../persistence/adapter';
import { createRealClock } from './clock';
import { createSession, snapshot, type CharacterSession } from './session';
import { decaySession } from './tick';
import { evaluateThreshold } from './thresholds';
export interface ThresholdChange { characterId: string; stat: MetabolismStat; severity: Severity }
type Subscriber = (state: Readonly<MetabolismSnapshot>, changed: MetabolismStat[]) => void | Promise<void>;
export function createMetabolismEngine(options: {
  config?: unknown; clock?: Clock; persistence: PersistenceAdapter; log?: Logger;
  isOnline?: (id: string) => boolean; onThreshold?: (event: ThresholdChange) => void;
}) {
  const config: MetabolismConfig = readConfig(options.config), clock = options.clock ?? createRealClock();
  const persistence = options.persistence, log = options.log ?? console;
  const sessions = new Map<string, CharacterSession>(), subscriptions = new Map<symbol, { owner: string; handler: Subscriber }>();
  let tail: Promise<unknown> = Promise.resolve(), pending = 0, stopping = false, stopped = false, stopTask: Promise<void> | null = null;
  function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    if (stopping) return Promise.reject(new Error('Metabolism engine stopped'));
    if (pending >= 1024) return Promise.reject(new Error('Metabolism operation queue full'));
    pending++;
    const job = tail.then(operation);
    tail = job.catch(() => {}).finally(() => { pending--; }); return job;
  }
  function active() { check(config.enabled && !stopped, 'Metabolism is disabled or stopped'); }
  function publish(s: CharacterSession, changed: MetabolismStat[]) {
    if (!changed.length) return;
    check(s.state.revision < Number.MAX_SAFE_INTEGER, 'Revision exhausted');
    s.state.revision++; s.dirty = true;
    for (const stat of changed) {
      const before = s.severity[stat], next = evaluateThreshold(s.state[stat], config.thresholds, before);
      s.severity[stat] = next;
      if (before !== next && clock.now() >= s.nextNotice[stat]) {
        s.nextNotice[stat] = clock.now() + config.thresholds.notificationCooldownSeconds * 1000;
        try { options.onThreshold?.({ characterId: s.state.characterId, stat, severity: next }); }
        catch { log.warn('[skymp-metabolism] Threshold consumer failed'); }
      }
    }
    for (const { handler } of subscriptions.values()) {
      try { Promise.resolve(handler(snapshot(s), [...changed])).catch(() => log.warn('[skymp-metabolism] Subscriber rejected')); }
      catch { log.warn('[skymp-metabolism] Subscriber failed'); }
    }
  }
  function decay(s: CharacterSession, now: number) { publish(s, decaySession(s, config, now)); }
  async function save(s: CharacterSession) {
    if (!s.dirty) return;
    const value = { ...s.state, lastPersistedAt: Math.max(0, Math.floor(clock.wallNow())) };
    await persistence.save(value, s.persistedRevision);
    s.state = value; s.persistedRevision = value.revision; s.dirty = false; s.lastSaved = clock.now();
  }
  function verified(id: string) { return !options.isOnline || options.isOnline(id); }
  async function flushAll() {
    const errors: unknown[] = [];
    for (const [id, s] of sessions) {
      try { await save(s); if (!s.online) sessions.delete(id); } catch (e) { errors.push(e); }
    }
    try { await persistence.flush(); } catch (e) { errors.push(e); }
    if (errors.length) throw new AggregateError(errors, 'Metabolism save/flush failed; dirty state retained');
  }
  return {
    config,
    hasSession(id: string) { return sessions.has(id); },
    loadCharacter(id: string) { return enqueue(async () => {
      active(); characterId(id);
      let s = sessions.get(id);
      if (s) {
        if (!s.online) { s.online = true; s.lastTick = clock.now(); }
        return snapshot(s);
      }
      check(sessions.size < config.limits.maxActiveCharacters, 'Character capacity reached');
      const existing = await persistence.load(id); // Failure must never become default initialization.
      s = createSession(id, config, clock, existing);
      await save(s); sessions.set(id, s); return snapshot(s);
    }); },
    unloadCharacter(id: string, at = clock.now()) { return enqueue(async () => {
      const s = sessions.get(id); if (!s) return;
      if (s.online) { decay(s, at); s.online = false; }
      await save(s); sessions.delete(id);
    }); },
    tick() { return enqueue(async () => {
      if (!config.enabled) return;
      const now = clock.now();
      for (const [id, s] of sessions) {
        if (s.online && verified(id) && now - s.lastTick >= config.clock.tickIntervalSeconds * 1000) decay(s, now);
        if (s.dirty && now - s.lastSaved >= config.persistence.autosaveSeconds * 1000) {
          try { await save(s); if (!s.online) sessions.delete(id); }
          catch { log.error('[skymp-metabolism] Autosave failed; dirty state retained'); s.lastSaved = now; }
        }
      }
    }); },
    getState(id: string): Readonly<MetabolismSnapshot> | null {
      characterId(id); const s = sessions.get(id); return config.enabled && !stopping && s?.online && verified(id) ? snapshot(s) : null;
    },
    adjustStat(id: string, stat: MetabolismStat, delta: number, reason: MetabolismReason, owner = 'trusted-server') {
      // Validate before queueing to bound invalid-input work.
      try { characterId(id); check(isStat(stat), 'Invalid stat'); bounded(delta, -100, 100, 'delta'); validateReason(reason); ownerId(owner); }
      catch (e) { return Promise.reject(e); }
      return enqueue(() => {
        active(); const s = sessions.get(id); check(s?.online && verified(id), 'Character is not active');
        const now = clock.now();
        if (now - s.budgetAt >= 60000) { s.budgetAt = now; s.adjustments = 0; }
        check(s.adjustments < config.limits.adjustmentsPerMinute, 'Adjustment rate limit'); s.adjustments++;
        decay(s, now); const value = applyAdjustment(s.state[stat], delta);
        if (value !== s.state[stat]) {
          check(s.state.revision < Number.MAX_SAFE_INTEGER, 'Revision exhausted');
          s.state[stat] = value; publish(s, [stat]);
          log.info('[skymp-metabolism] ' + JSON.stringify({ owner, reason, characterId: id, stat, delta }));
        }
        return snapshot(s);
      });
    },
    onStateChange(owner: string, handler: Subscriber) {
      active(); check(!stopping, 'Metabolism engine stopped'); ownerId(owner); check(typeof handler === 'function', 'Invalid subscriber');
      check(subscriptions.size < config.limits.maxSubscriptions, 'Subscription limit');
      const token = Symbol(); subscriptions.set(token, { owner, handler }); return () => { subscriptions.delete(token); };
    },
    removeOwner(owner: string) { ownerId(owner); for (const [key, s] of subscriptions) if (s.owner === owner) subscriptions.delete(key); },
    flush() { return enqueue(flushAll); },
    submitExit() {
      // Node's exit event cannot await a Promise. Only the native synchronous handoff is possible here.
      if (!persistence.saveSync || stopped) return;
      for (const [id, s] of sessions) {
        try {
          if (s.online && verified(id)) decay(s, clock.now());
          if (!s.dirty) continue;
          const value = { ...s.state, lastPersistedAt: Math.max(0, Math.floor(clock.wallNow())) };
          persistence.saveSync(value, s.persistedRevision);
          s.state = value; s.persistedRevision = value.revision; s.dirty = false;
        } catch { log.error('[skymp-metabolism] Exit handoff failed; no durable DB acknowledgement available'); }
      }
    },
    stop() {
      if (stopTask) return stopTask;
      stopping = true;
      stopTask = tail.then(async () => {
        for (const [id, s] of sessions) { if (s.online && verified(id)) decay(s, clock.now()); s.online = false; }
        await flushAll(); await persistence.close(); sessions.clear(); subscriptions.clear(); stopped = true;
      }).catch(e => { stopTask = null; throw e; });
      return stopTask;
    },
    getStatus() { return { ready: config.enabled && !stopping, apiVersion: 1 as const,
      activeCharacters: [...sessions.values()].filter(s => s.online).length, pendingSaves: [...sessions.values()].filter(s => s.dirty).length }; },
  };
}
export type MetabolismEngine = ReturnType<typeof createMetabolismEngine>;
