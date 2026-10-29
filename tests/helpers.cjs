'use strict';
const { EventEmitter } = require('node:events');
const { createMetabolism, createFakeClock, NATIVE_PROPERTY } = require('../dist/library.cjs');
const quiet = { info() {}, warn() {}, error() {} };
class FakeMp extends EventEmitter {
  constructor() { super(); this.actors = new Map(); this.users = new Map(); this.sockets = new Set(); this.output = []; this.failWrites = false; this.writes = 0; }
  addActor(actor, profile = actor) { this.actors.set(actor, { profileId: profile }); return actor; }
  connect(user, actor) { this.sockets.add(user); if (actor) this.users.set(user, actor); this.emit('connect', user); }
  disconnect(user) { this.sockets.delete(user); this.users.delete(user); this.emit('disconnect', user); }
  switchActor(user, actor) { this.users.set(user, actor); }
  isConnected(user) { return this.sockets.has(user); }
  getUserActor(user) { return this.users.get(user) || 0; }
  getUserByActor(actor) { return [...this.users].find(([, a]) => a === actor)?.[0] ?? -1; }
  getServerSettings() { return { maxPlayers: 16 }; }
  getUserGuid(user) { return 'guid-' + user; }
  getActorName(actor) { return 'Actor ' + actor; }
  get(actor, key) { if (!this.actors.has(actor)) throw Error('Actor missing'); return structuredClone(this.actors.get(actor)[key] ?? null); }
  set(actor, key, value) { if (this.failWrites) throw Error('Simulated native write failure'); if (!this.actors.has(actor)) throw Error('Actor missing'); this.writes++; this.actors.get(actor)[key] = structuredClone(value); }
  sendCustomPacket(userId, content) { this.output.push({ userId, ...JSON.parse(content) }); }
}
function fakeUi() {
  const definitions = new Map(), updates = [], notices = [], visibility = [];
  return { apiVersion: 1, definitions, updates, notices, visibility,
    getStatus: () => ({ ready: true, apiVersion: 1, frontendProtocol: 1 }),
    registerWidget(d) { if (!d.id.startsWith(d.owner + ':') || definitions.has(d.id)) throw Error('Owner/collision'); definitions.set(d.id, d); },
    unregisterWidget(owner, id) { if (definitions.get(id)?.owner !== owner) throw Error('Owner'); definitions.delete(id); },
    updateWidget(target, id, state) { if (!definitions.has(id)) throw Error('Unknown widget'); updates.push({ ...target, id, state }); },
    setWidgetVisible(target, id, visible) { visibility.push({ ...target, id, visible }); },
    notify(target, message, options) { notices.push({ ...target, message, options }); },
  };
}
async function fixture(extra = {}, config = {}) {
  const mp = new FakeMp(), clock = createFakeClock(); mp.addActor(101, 10); mp.addActor(102, 20); mp.connect(0, 101); mp.connect(1, 102);
  const runtime = createMetabolism(mp, { clock, log: quiet, config: { chat: { enabled: false }, ui: { enabled: false }, ...config }, ...extra });
  await runtime.pump();
  const id = actor => mp.get(actor, NATIVE_PROPERTY).characterId;
  return { mp, clock, runtime, id };
}
module.exports = { FakeMp, fakeUi, fixture, quiet };
