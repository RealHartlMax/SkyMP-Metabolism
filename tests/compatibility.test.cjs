'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const esbuild = require('esbuild');
const { createMetabolism, createFakeClock, NATIVE_PROPERTY } = require('../dist/library.cjs');
const { FakeMp, quiet } = require('./helpers.cjs');
const chatRoot = path.resolve(process.env.SKYMP_CHAT || '../SkyMP-Chat');
const uiRoot = path.resolve(process.env.SKYMP_UI_CORE || '../SkyMP-UI-Core');
const chatAvailable = fs.existsSync(path.join(chatRoot, 'Plugins/SkyMPChat/src/runtime.cjs'));
const uiAvailable = fs.existsSync(path.join(uiRoot, 'src/runtime.ts'));
test('real current Chat registry routes private DE/EN status and rejects hidden alias collisions', { skip: !chatAvailable }, async () => {
  const { createChat } = require(path.join(chatRoot, 'Plugins/SkyMPChat/src/runtime.cjs'));
  for (const locale of ['de', 'en']) {
    const mp = new FakeMp(), clock = createFakeClock(); mp.addActor(101, 10); mp.addActor(102, 20); mp.connect(0, 101); mp.connect(1, 102);
    const chat = createChat(mp, { config: { locale, commandsOnly: true, showJoinMessages: false }, log: quiet, now: () => clock.now() });
    const runtime = createMetabolism(mp, { clock, log: quiet, chatApi: chat.api, config: { locale, ui: { enabled: false } } }); await runtime.pump();
    const a = mp.get(101, NATIVE_PROPERTY).characterId; await runtime.api.adjustStat(a, 'satiety', -20, 'job');
    for (const user of [0, 1]) mp.emit('customPacket', user, JSON.stringify({ customPacketType: 'skympChat:ready' }));
    mp.output.length = 0;
    mp.emit('customPacket', 0, JSON.stringify({ customPacketType: 'skympChat:send', requestId: 'status_1', text: '/status' }));
    await new Promise(setImmediate);
    const messages = mp.output.filter(p => p.customPacketType === 'skympChat:message'); assert.equal(messages.length, 4);
    assert(messages.every(p => p.userId === 0 && p.message.channel === 'private')); const text = messages.map(p => p.message.text).join(' ');
    assert(text.includes(locale === 'de' ? 'Sättigung: 80,0/100' : 'Satiety: 80.0/100')); assert(text.includes(locale === 'de' ? '100 = satt' : '100 = well fed'));
    await runtime.stop(); assert(!chat.api.getCommandsForPlayer(0).some(c => c.name === 'status')); chat.stop();
  }
  const mp = new FakeMp(); mp.addActor(101, 10); mp.connect(0, 101);
  const chat = createChat(mp, { config: { commandsOnly: true }, log: quiet });
  chat.api.registerCommand({ owner: 'other', name: 'hidden', aliases: ['status'], permission: 'admin', description: 'Private', execute() {} });
  const runtime = createMetabolism(mp, { chatApi: chat.api, log: quiet }); await runtime.pump();
  mp.emit('customPacket', 0, JSON.stringify({ customPacketType: 'skympChat:ready' }));
  assert(chat.api.getCommandsForPlayer(0).some(c => c.name === 'metabolism')); assert(!chat.api.getCommandsForPlayer(0).some(c => c.name === 'status'));
  await runtime.stop(); assert.throws(() => chat.api.registerCommand({ owner: 'probe', name: 'status', description: 'Probe', execute() {} }), /conflict/); chat.stop();
});
test('real current UI Core validates owner, list schema, initial/reconnect snapshots and private alerts', { skip: !uiAvailable }, async () => {
  const out = path.resolve('artifacts/compat-ui-runtime.cjs'); fs.mkdirSync(path.dirname(out), { recursive: true });
  esbuild.buildSync({ entryPoints: [path.join(uiRoot, 'src/runtime.ts')], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const { createUiCore } = require(out), mp = new FakeMp(), clock = createFakeClock(); mp.addActor(101, 10); mp.addActor(102, 20); mp.connect(0, 101); mp.connect(1, 102);
  const ui = createUiCore(mp, { autoFlush: false, now: () => clock.wallNow(), log: quiet });
  const runtime = createMetabolism(mp, { clock, log: quiet, uiApi: ui.api, config: { chat: { enabled: false } } }); await runtime.pump();
  for (const user of [0, 1]) mp.emit('customPacket', user, JSON.stringify({ customPacketType: 'skympUi:ready', protocolVersion: 1, frontId: 'front_' + user }));
  ui.flush();
  for (const user of [0, 1]) {
    const frame = mp.output.filter(p => p.userId === user && p.customPacketType === 'skympUi:snapshot').at(-1);
    assert.equal(frame.widgets.length, 1); assert.equal(frame.widgets[0].definition.owner, 'skymp-metabolism'); assert.equal(frame.widgets[0].state.items.length, 3);
  }
  const a = mp.get(101, NATIVE_PROPERTY).characterId; mp.output.length = 0;
  await runtime.api.adjustStat(a, 'hydration', -60, 'job'); ui.flush();
  assert.equal(mp.output.filter(p => p.userId === 0 && p.customPacketType === 'skympUi:update').at(-1).notifications.length, 1);
  clock.advance(5000); await runtime.pump(); ui.flush();
  const frame = mp.output.filter(p => p.userId === 0 && p.customPacketType === 'skympUi:update').at(-1);
  assert(frame.widgets[0].state.items[1].value.startsWith('40,0/100')); assert.equal(frame.notifications.length, 0, 'notice expired after its real UI Core TTL');
  assert(!mp.output.some(p => p.userId === 1));
  clock.advance(2000); mp.emit('customPacket', 0, JSON.stringify({ customPacketType: 'skympUi:ready', protocolVersion: 1, frontId: 'front_reloaded' }));
  assert(mp.output.filter(p => p.customPacketType === 'skympUi:snapshot').at(-1).widgets[0].state.items[1].value.startsWith('40,0/100'));
  await runtime.stop(); ui.flush(); assert.equal(mp.output.filter(p => p.userId === 0 && p.customPacketType === 'skympUi:update').at(-1).widgets.length, 0); ui.stop();
});
