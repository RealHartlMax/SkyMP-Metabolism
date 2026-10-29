import type { SkyMpApi } from './adapter';
type Event = 'connect' | 'disconnect';
type Handler = (userId: number) => void;
interface Dispatcher { listeners: Set<Handler>; dispatch: Handler }
const key = Symbol.for('skymp-metabolism.lifecycle.v1');
const globals = globalThis as any;
const entries: WeakMap<SkyMpApi, Map<Event, Dispatcher>> = globals[key] ?? new WeakMap();
if (!globals[key]) Object.defineProperty(globals, key, { value: entries });
/** The native API has on(), but no removeListener(). Keep at most one inert dispatcher per event. */
export function subscribeLifecycle(mp: SkyMpApi, event: Event, handler: Handler): () => void {
  let events = entries.get(mp); if (!events) { events = new Map(); entries.set(mp, events); }
  let entry = events.get(event);
  if (!entry) {
    const listeners = new Set<Handler>();
    entry = { listeners, dispatch: userId => { for (const listener of [...listeners]) listener(userId); } };
    mp.on(event, entry.dispatch); events.set(event, entry);
  }
  entry.listeners.add(handler);
  return () => {
    entry!.listeners.delete(handler);
    if (!entry!.listeners.size && mp.removeListener) { mp.removeListener(event, entry!.dispatch); events!.delete(event); }
  };
}
