import { randomUUID } from 'node:crypto';
import { setInterval, clearInterval } from 'node:timers';
import { type Clock, type Logger } from './domain/types';
import { check } from './domain/validation';
import { readConfig } from './config';
import { createLocalizer, type TranslationKey } from './localization';
import { createRealClock } from './engine/clock';
import { createMetabolismEngine } from './engine/engine';
import { NativePersistenceAdapter } from './persistence/native';
import { MemoryAdapter } from './persistence/adapter';
import { resolveIdentity, type SkyMpApi } from './integrations/skymp/adapter';
import { subscribeLifecycle } from './integrations/skymp/lifecycle';
import { ChatAdapter, detectChatApi } from './integrations/chat/adapter';
import { UiAdapter } from './integrations/ui-core/adapter';
import { ConsumableRegistry } from './integrations/inventory/consumption';
import type { SkyMpMetabolismApiV1 } from './api/contract';
interface Binding { userId: number; actorId: number; characterId: string; generation: number }
export function createMetabolism(mp: SkyMpApi, options: {
  config?: unknown; locales?: unknown; clock?: Clock; log?: Logger; chatApi?: unknown; uiApi?: unknown; getUiApi?: () => unknown; autoStart?: boolean;
} = {}) {
  const c = readConfig(options.config), clock = options.clock ?? createRealClock(), log = options.log ?? console;
  const l = createLocalizer(c.locale, options.locales), users = new Set<number>(), bindings = new Map<number, Binding>();
  const byCharacter = new Map<string, Binding>(), generations = new Map<number, number>(), retired = new Set<string>();
  const native = c.persistence.mode === 'native' ? new NativePersistenceAdapter(mp) : null;
  const persistence = native ?? new MemoryAdapter(), registry = new ConsumableRegistry(c.limits.maxConsumables);
  let started = false, stopping = false, stopped = false, timer: ReturnType<typeof setInterval> | null = null;
  let tail: Promise<unknown> = Promise.resolve(), pumpTask: Promise<void> | null = null, stopTask: Promise<void> | null = null;
  const diagnostics = new Map<number, string>();
  const unsubscribe: Array<() => void> = [];
  function valid(b: Binding) {
    return !stopping && bindings.get(b.userId) === b && generations.get(b.userId) === b.generation &&
      resolveIdentity(mp, b.userId)?.actorId === b.actorId && (!native || native.matches(b.characterId, b.actorId));
  }
  const ui = new UiAdapter(options.getUiApi ?? (() => options.uiApi), c, l, clock, log);
  const engine = createMetabolismEngine({ config: c, clock, persistence, log,
    isOnline: id => { const b = byCharacter.get(id); return !!b && valid(b); },
    onThreshold: event => {
      const b = byCharacter.get(event.characterId); if (!b || !valid(b)) return;
      const message = l.t((event.stat + '.' + event.severity) as TranslationKey);
      if (!ui.notify(b.userId, message, event.severity === 'healthy') && !chat.notify(b.userId, message))
        log.info('[skymp-metabolism] Threshold: ' + event.stat + '/' + event.severity);
    },
  });
  const chat = new ChatAdapter(detectChatApi(options.chatApi), c, l, (userId, actorId) => {
    const b = bindings.get(userId);
    return b && b.actorId === actorId && valid(b) ? engine.getState(b.characterId) : null;
  }, log);
  function sequence<T>(fn: () => Promise<T> | T): Promise<T> {
    const job = tail.then(fn); tail = job.catch(() => {}); return job;
  }
  function forget(b: Binding) {
    if (bindings.get(b.userId) === b) bindings.delete(b.userId);
    if (byCharacter.get(b.characterId) === b) byCharacter.delete(b.characterId);
    ui.remove(b.userId);
  }
  async function detach(b: Binding, at: number) {
    forget(b);
    try {
      await engine.unloadCharacter(b.characterId, at); native?.unbind(b.characterId);
      if (!native) await persistence.delete(b.characterId);
    } catch { retired.add(b.characterId); log.error('[skymp-metabolism] Disconnect save failed; retained for retry'); }
  }
  function connect(userId: number) {
    if (stopping || !Number.isInteger(userId) || userId < 0 || userId >= 65535) return;
    if (users.size >= c.limits.maxActiveCharacters && !users.has(userId)) { log.warn('[skymp-metabolism] Connection tracking capacity reached'); return; }
    if (!generations.has(userId)) generations.set(userId, 1);
    users.add(userId);
  }
  function disconnect(userId: number) {
    if (stopping) return;
    users.delete(userId); generations.set(userId, (generations.get(userId) ?? 0) + 1); diagnostics.delete(userId);
    const b = bindings.get(userId), at = clock.now();
    if (b) { forget(b); void sequence(() => detach(b, at)).catch(() => {}); }
  }
  function pump(): Promise<void> {
    if (stopping || !started || !c.enabled) return Promise.resolve();
    if (pumpTask) return pumpTask;
    pumpTask = sequence(async () => {
      if (stopping) return;
      ui.retryRegistration();
      for (const userId of users) {
        if (stopping) break;
        if (!mp.isConnected(userId)) { disconnect(userId); continue; }
        const identity = resolveIdentity(mp, userId), previous = bindings.get(userId);
        if (previous && (!identity || !valid(previous))) await detach(previous, clock.now());
        if (!identity || bindings.has(userId)) continue;
        let candidateId: string | undefined;
        try {
          const generation = generations.get(userId)!;
          const characterId = native ? native.bind(identity.actorId) : 'session:' + randomUUID();
          candidateId = characterId;
          check(!byCharacter.has(characterId), 'Character is already bound to another session');
          const s = await engine.loadCharacter(characterId);
          if (stopping || !users.has(userId) || generations.get(userId) !== generation || resolveIdentity(mp, userId)?.actorId !== identity.actorId) {
            await engine.unloadCharacter(characterId, clock.now()); native?.unbind(characterId);
            if (!native) await persistence.delete(characterId);
            continue;
          }
          const b = { ...identity, characterId, generation }; bindings.set(userId, b); byCharacter.set(characterId, b);
          retired.delete(characterId); diagnostics.delete(userId); ui.update(userId, s, true);
        } catch (error) {
          if (candidateId && !byCharacter.has(candidateId) && !engine.hasSession(candidateId)) native?.unbind(candidateId);
          const message = error instanceof Error ? error.message : 'Character load failed';
          if (diagnostics.get(userId) !== message) { log.error('[skymp-metabolism] Character unavailable: ' + message); diagnostics.set(userId, message); }
        }
      }
      await engine.tick();
      for (const b of bindings.values()) { const s = valid(b) ? engine.getState(b.characterId) : null; if (s) ui.update(b.userId, s); }
      for (const id of retired) if (!engine.hasSession(id)) { native?.unbind(id); retired.delete(id); }
      // Drop disconnected generation records; a reconnect gets a fresh native session and no stale binding.
      for (const userId of generations.keys()) if (!users.has(userId) && !bindings.has(userId)) generations.delete(userId);
    }).finally(() => { pumpTask = null; });
    return pumpTask;
  }
  const api = Object.freeze<SkyMpMetabolismApiV1>({ apiVersion: 1,
    getState: engine.getState, adjustStat: engine.adjustStat,
    registerConsumable(def) { check(c.enabled && !stopping, 'Metabolism disabled/stopped'); registry.register(def); },
    unregisterConsumable: (owner, key) => registry.unregister(owner, key),
    onStateChange(owner, handler) { check(c.enabled && !stopping, 'Metabolism disabled/stopped'); return engine.onStateChange(owner, handler); },
    getStatus: () => ({ ...engine.getStatus(), ready: started && !stopping && c.enabled, persistenceMode: c.persistence.mode }),
  });
  function start() {
    if (started || stopping) return;
    started = true;
    if (!c.enabled) { log.info('[skymp-metabolism] Disabled by configuration'); return; }
    for (const method of ['on', 'isConnected', 'getUserActor', 'getUserByActor', 'getServerSettings', ...(native ? ['get', 'set'] : [])])
      check(typeof (mp as any)?.[method] === 'function', 'Metabolism requires native mp.' + method);
    const maxPlayers = mp.getServerSettings().maxPlayers ?? 100;
    check(Number.isInteger(maxPlayers) && maxPlayers > 0 && maxPlayers <= 65535, 'Invalid native maxPlayers');
    unsubscribe.push(subscribeLifecycle(mp, 'connect', connect), subscribeLifecycle(mp, 'disconnect', disconnect));
    for (let userId = 0; userId < maxPlayers; userId++) if (mp.isConnected(userId)) connect(userId);
    chat.register(); ui.register();
    if (!native) log.warn('[skymp-metabolism] SESSION-ONLY: reconnect/restart creates new state; no character persistence');
    timer = setInterval(() => { void pump().catch(() => log.error('[skymp-metabolism] Scheduler failed; next cycle will retry')); }, c.clock.lifecyclePollSeconds * 1000);
    timer.unref(); void pump().catch(() => log.error('[skymp-metabolism] Initial character scan failed'));
  }
  function stop(): Promise<void> {
    if (stopTask) return stopTask;
    const at = clock.now(), finalBindings = [...bindings.values()].filter(valid);
    stopping = true; if (timer) { clearInterval(timer); timer = null; }
    chat.unregister(); ui.unregister();
    for (const release of unsubscribe.splice(0)) release();
    stopTask = sequence(async () => {
      // Finish verified online time at the captured stop instant, not after asynchronous cleanup.
      for (const b of finalBindings) {
        try { await engine.unloadCharacter(b.characterId, at); }
        catch { log.warn('[skymp-metabolism] Final save will be retried during stop flush'); }
      }
      await engine.stop(); registry.clear(); users.clear(); bindings.clear(); byCharacter.clear(); retired.clear(); diagnostics.clear(); generations.clear(); stopped = true;
    }).catch(e => { stopTask = null; throw e; });
    return stopTask;
  }
  if (options.autoStart !== false) start();
  return { api, start, stop, pump, flush: () => sequence(() => engine.flush()), submitExit: () => engine.submitExit(),
    get stopped() { return stopped; }, config: c };
}
